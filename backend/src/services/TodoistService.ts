import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { TodoItem } from '../entities/TodoItem';

/**
 * Sincronizzazione bidirezionale To-Do di Visit Tracker <-> Todoist.
 *
 * - Ogni utente collega il proprio Todoist via OAuth (token senza scadenza).
 * - Un task VT vive nel Todoist del suo ASSEGNATARIO, in un progetto
 *   "Visit Tracker" per categoria (Lavoro / Personale / Linee architettoniche).
 * - VT -> Todoist: TodoService chiama pushTodo/removeTodo dopo ogni modifica.
 * - Todoist -> VT: webhook (item:added/updated/completed/uncompleted/deleted)
 *   scrive direttamente sul repository, senza ri-chiamare pushTodo (niente loop).
 *
 * Mapping:
 *   title            <-> content
 *   description      <-> description (+ footer VT con cliente/azienda/link, rimosso in ingresso)
 *   due_date         <-> due.date
 *   priority 1/2/3   <-> priority 2/3/4 (p3/p2/p1 nell'app Todoist)
 *   status done      <-> task completato
 *   status in_progress <-> etichetta "in-corso"
 *   category         <-> progetto
 */

const API = 'https://api.todoist.com/api/v1';
const OAUTH = 'https://todoist.com/oauth';

const IN_PROGRESS_LABEL = 'in-corso';
const FOOTER_MARKER = '— Visit Tracker —';

const CATEGORY_PROJECTS: Record<string, string> = {
  work: 'Visit Tracker – Lavoro',
  personal: 'Visit Tracker – Personale',
  architectural_lines: 'Visit Tracker – Linee architettoniche',
};

type TodoistTask = {
  id: string;
  content: string;
  description?: string;
  priority?: number;
  due?: { date?: string } | null;
  checked?: boolean;
  project_id?: string;
  labels?: string[];
  is_deleted?: boolean;
};

export class TodoistService {
  private clientId = process.env.TODOIST_CLIENT_ID || '';
  private clientSecret = process.env.TODOIST_CLIENT_SECRET || '';
  private frontendUrl = process.env.FRONTEND_URL || 'https://visit-tracker-pi.vercel.app';

  private get userRepo() { return AppDataSource.getRepository(User); }
  private get todoRepo() { return AppDataSource.getRepository(TodoItem); }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  // ─── OAuth ────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'data:read_write,data:delete',
      state,
    });
    return `${OAUTH}/authorize?${params.toString()}`;
  }

  async exchangeCodeForUser(userId: string, code: string): Promise<void> {
    const res = await axios.post(
      `${OAUTH}/access_token`,
      new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, code }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const token: string = res.data?.access_token;
    if (!token) throw new Error('Todoist non ha restituito un token');

    let todoistUserId: string | null = null;
    let todoistEmail: string | null = null;
    try {
      const me = await axios.post(
        `${API}/sync`,
        new URLSearchParams({ sync_token: '*', resource_types: '["user"]' }).toString(),
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      todoistUserId = me.data?.user?.id != null ? String(me.data.user.id) : null;
      todoistEmail = me.data?.user?.email || null;
    } catch (e) {
      console.error('[Todoist] Impossibile leggere il profilo utente:', (e as Error).message);
    }

    await this.userRepo.update(userId, {
      todoist_access_token: token,
      todoist_user_id: todoistUserId,
      todoist_email: todoistEmail,
      todoist_project_ids: null,
    });
  }

  async disconnect(userId: string): Promise<void> {
    // I task restano nel Todoist dell'utente; qui smettiamo solo di sincronizzarli.
    await this.todoRepo.update(
      { todoist_owner_user_id: userId },
      { todoist_task_id: null, todoist_owner_user_id: null },
    );
    await this.userRepo.update(userId, {
      todoist_access_token: null,
      todoist_user_id: null,
      todoist_email: null,
      todoist_project_ids: null,
    });
  }

  async getStatus(userId: string) {
    const user = await this.loadUserWithToken(userId);
    return {
      configured: this.isConfigured(),
      connected: !!user?.todoist_access_token,
      email: user?.todoist_email || null,
    };
  }

  // ─── VT -> Todoist ─────────────────────────────────────────────────────

  /** Crea o aggiorna su Todoist il task VT. Non lancia mai: logga e basta. */
  async pushTodo(todoId: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const todo = await this.todoRepo.findOne({ where: { id: todoId }, relations: ['client', 'company'] });
      if (!todo) return;
      // Cancellato su Todoist e non ancora ripristinato: non ricrearlo di nascosto
      if (todo.todoist_deleted_at) return;

      // Riassegnato a un altro utente: togli il task dal Todoist del vecchio assegnatario
      if (todo.todoist_task_id && todo.todoist_owner_user_id && String(todo.todoist_owner_user_id) !== String(todo.assigned_to_user_id)) {
        await this.deleteRemoteTask(todo.todoist_owner_user_id, todo.todoist_task_id);
        todo.todoist_task_id = null;
        todo.todoist_owner_user_id = null;
        await this.todoRepo.update(todo.id, { todoist_task_id: null, todoist_owner_user_id: null });
      }

      const owner = await this.loadUserWithToken(todo.assigned_to_user_id);
      if (!owner?.todoist_access_token) return; // assegnatario senza Todoist collegato

      const projectId = await this.ensureProject(owner, todo.category || 'work');
      const body = this.toTodoistPayload(todo);

      if (!todo.todoist_task_id) {
        // Un task già completato non va creato su Todoist
        if (todo.status === 'done') return;
        const created = await this.api(owner, 'post', '/tasks', { ...body, project_id: projectId });
        await this.todoRepo.update(todo.id, { todoist_task_id: String(created.id), todoist_owner_user_id: owner.id });
        return;
      }

      try {
        await this.api(owner, 'post', `/tasks/${todo.todoist_task_id}`, body);
        // Spostamento di progetto se la categoria è cambiata
        await this.api(owner, 'post', `/tasks/${todo.todoist_task_id}/move`, { project_id: projectId }).catch(() => {});
        if (todo.status === 'done') {
          await this.api(owner, 'post', `/tasks/${todo.todoist_task_id}/close`);
        } else {
          await this.api(owner, 'post', `/tasks/${todo.todoist_task_id}/reopen`).catch(() => {});
        }
      } catch (e) {
        if (this.isNotFound(e)) {
          // Task cancellato su Todoist nel frattempo: scollega
          await this.todoRepo.update(todo.id, { todoist_task_id: null, todoist_owner_user_id: null });
          return;
        }
        throw e;
      }
    } catch (e) {
      console.error(`[Todoist] pushTodo ${todoId} fallito:`, this.describe(e));
    }
  }

  /**
   * Ripristina un task cancellato su Todoist: toglie il segnale e lo ricrea su Todoist.
   * Ritorna true se il task è di nuovo su Todoist (false se l'assegnatario non ha
   * Todoist collegato o se il task è completato).
   */
  async restoreTodo(todoId: string): Promise<boolean> {
    await this.todoRepo.update(todoId, { todoist_deleted_at: null });
    await this.pushTodo(todoId);
    const after = await this.todoRepo.findOne({ where: { id: todoId } });
    return !!after?.todoist_task_id;
  }

  /** Cancella da Todoist il task collegato a un todo VT che sta per essere eliminato. */
  async removeTodo(todo: Pick<TodoItem, 'todoist_task_id' | 'todoist_owner_user_id'>): Promise<void> {
    if (!this.isConfigured() || !todo.todoist_task_id || !todo.todoist_owner_user_id) return;
    try {
      await this.deleteRemoteTask(todo.todoist_owner_user_id, todo.todoist_task_id);
    } catch (e) {
      console.error('[Todoist] removeTodo fallito:', this.describe(e));
    }
  }

  /** Prima sincronizzazione dopo il collegamento: invia i task aperti assegnati all'utente. */
  async initialSync(userId: string): Promise<void> {
    const todos = await this.todoRepo
      .createQueryBuilder('todo')
      .where('todo.assigned_to_user_id = :userId', { userId })
      .andWhere("todo.status != 'done'")
      .andWhere('todo.todoist_task_id IS NULL')
      .andWhere('todo.todoist_deleted_at IS NULL')
      .getMany();
    for (const t of todos) {
      await this.pushTodo(t.id);
      await new Promise(r => setTimeout(r, 250)); // gentile coi rate limit
    }
    console.log(`[Todoist] Sync iniziale utente ${userId}: ${todos.length} task inviati`);
  }

  // ─── Todoist -> VT (webhook) ───────────────────────────────────────────

  verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!rawBody || !signature || !this.clientSecret) return false;
    const expected = crypto.createHmac('sha256', this.clientSecret).update(rawBody).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async handleWebhook(payload: any): Promise<void> {
    const event: string = payload?.event_name || '';
    const task: TodoistTask | undefined = payload?.event_data;
    if (!event.startsWith('item:') || !task?.id) return;

    const todoistTaskId = String(task.id);
    const linked = await this.todoRepo.findOne({ where: { todoist_task_id: todoistTaskId } });

    if (event === 'item:deleted') {
      // Prudenza: non cancelliamo dati VT (allegati, collegamenti a visite/reclami).
      // Scolleghiamo il task e lo segnaliamo: l'utente sceglierà se ripristinarlo o eliminarlo.
      if (linked) {
        await this.todoRepo.update(linked.id, {
          todoist_task_id: null,
          todoist_owner_user_id: null,
          todoist_deleted_at: new Date(),
        });
      }
      return;
    }

    if (linked) {
      await this.applyRemoteChanges(linked, task, event);
      return;
    }

    if (event !== 'item:added') return;

    // Task creato da VT: il webhook può arrivare prima che abbiamo salvato l'id → riconoscilo dal link nel footer
    const vtId = this.extractVtId(task.description);
    if (vtId) {
      const own = await this.todoRepo.findOne({ where: { id: vtId } });
      if (own && !own.todoist_task_id) {
        await this.todoRepo.update(own.id, { todoist_task_id: todoistTaskId, todoist_owner_user_id: own.assigned_to_user_id });
      }
      return;
    }

    // Task nuovo creato su Todoist dentro un progetto "Visit Tracker" → crealo anche in VT
    const owner = await this.findOwner(payload?.user_id, task.project_id);
    if (!owner) return;
    const category = Object.entries(owner.todoist_project_ids || {})
      .find(([, pid]) => String(pid) === String(task.project_id))?.[0];
    if (!category) return; // task di un altro progetto Todoist: ignorato

    const todo = this.todoRepo.create({
      title: task.content || '(senza titolo)',
      description: this.stripFooter(task.description) || null,
      status: task.checked ? 'done' : (task.labels || []).includes(IN_PROGRESS_LABEL) ? 'in_progress' : 'todo',
      due_date: this.dueFromTask(task) as any,
      priority: this.priorityFromTodoist(task.priority),
      assigned_to_user_id: owner.id,
      created_by_user_id: owner.id,
      category,
      todoist_task_id: todoistTaskId,
      todoist_owner_user_id: owner.id,
    });
    await this.todoRepo.save(todo);
  }

  private async applyRemoteChanges(todo: TodoItem, task: TodoistTask, event: string): Promise<void> {
    const changes: Partial<TodoItem> = {};

    if (event === 'item:completed') {
      if (todo.status !== 'done') changes.status = 'done';
    } else if (event === 'item:uncompleted') {
      if (todo.status === 'done') changes.status = 'todo';
    } else {
      // item:updated (o item:added duplicato)
      if (task.content && task.content !== todo.title) changes.title = task.content;

      const desc = this.stripFooter(task.description) || null;
      if ((desc || null) !== (todo.description || null)) changes.description = desc;

      const due = this.dueFromTask(task);
      if (due !== this.dateStr(todo.due_date)) changes.due_date = due as any;

      const prio = this.priorityFromTodoist(task.priority);
      if (prio !== todo.priority) changes.priority = prio;

      const inProgress = (task.labels || []).includes(IN_PROGRESS_LABEL);
      let status: TodoItem['status'] = task.checked ? 'done' : inProgress ? 'in_progress' : 'todo';
      if (status !== todo.status) changes.status = status;

      // Categoria dal progetto (se spostato tra i progetti VT)
      const owner = todo.todoist_owner_user_id ? await this.userRepo.findOne({ where: { id: todo.todoist_owner_user_id } }) : null;
      const category = Object.entries(owner?.todoist_project_ids || {})
        .find(([, pid]) => String(pid) === String(task.project_id))?.[0];
      if (category && category !== todo.category) changes.category = category;
    }

    if (Object.keys(changes).length > 0) {
      await this.todoRepo.update(todo.id, changes);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async loadUserWithToken(userId: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.todoist_access_token')
      .where('user.id = :userId', { userId })
      .getOne();
  }

  private async findOwner(todoistUserId: any, projectId?: string): Promise<User | null> {
    if (todoistUserId != null) {
      const u = await this.userRepo.findOne({ where: { todoist_user_id: String(todoistUserId) } });
      if (u) return u;
    }
    if (!projectId) return null;
    const users = await this.userRepo
      .createQueryBuilder('user')
      .where('user.todoist_project_ids IS NOT NULL')
      .getMany();
    return users.find(u => Object.values(u.todoist_project_ids || {}).some(pid => String(pid) === String(projectId))) || null;
  }

  private async ensureProject(owner: User, category: string): Promise<string> {
    const cat = CATEGORY_PROJECTS[category] ? category : 'work';
    const cached = owner.todoist_project_ids?.[cat];
    if (cached) return cached;

    const name = CATEGORY_PROJECTS[cat];
    let projectId: string | null = null;

    // Cerca un progetto esistente con lo stesso nome
    let cursor: string | null = null;
    do {
      const page: any = await this.api(owner, 'get', `/projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      const found = (page?.results || []).find((p: any) => p.name === name && !p.is_deleted && !p.is_archived);
      if (found) { projectId = String(found.id); break; }
      cursor = page?.next_cursor || null;
    } while (cursor);

    if (!projectId) {
      const created = await this.api(owner, 'post', '/projects', { name });
      projectId = String(created.id);
    }

    const ids = { ...(owner.todoist_project_ids || {}), [cat]: projectId };
    owner.todoist_project_ids = ids;
    await this.userRepo.update(owner.id, { todoist_project_ids: ids });
    return projectId;
  }

  private async deleteRemoteTask(ownerUserId: string, taskId: string): Promise<void> {
    const owner = await this.loadUserWithToken(ownerUserId);
    if (!owner?.todoist_access_token) return;
    try {
      await this.api(owner, 'delete', `/tasks/${taskId}`);
    } catch (e) {
      if (!this.isNotFound(e)) throw e;
    }
  }

  private toTodoistPayload(todo: TodoItem) {
    const footer: string[] = [FOOTER_MARKER];
    if (todo.client?.name) footer.push(`Cliente: ${todo.client.name}`);
    if (todo.company?.name) footer.push(`Azienda: ${todo.company.name}`);
    footer.push(`${this.frontendUrl}/todos/${todo.id}`);

    const description = [todo.description?.trim(), footer.join('\n')].filter(Boolean).join('\n\n');
    const due = this.dateStr(todo.due_date);

    const payload: any = {
      content: todo.title,
      description,
      priority: Math.min(4, Math.max(1, (todo.priority || 1) + 1)),
      labels: todo.status === 'in_progress' ? [IN_PROGRESS_LABEL] : [],
    };
    if (due) payload.due_date = due;
    else payload.due_string = 'no date';
    return payload;
  }

  private stripFooter(description?: string | null): string {
    if (!description) return '';
    const idx = description.indexOf(FOOTER_MARKER);
    return (idx >= 0 ? description.slice(0, idx) : description).trim();
  }

  private extractVtId(description?: string | null): string | null {
    if (!description || !description.includes(FOOTER_MARKER)) return null;
    const m = description.match(/\/todos\/([0-9a-f-]{36})/i);
    return m ? m[1] : null;
  }

  private priorityFromTodoist(p?: number): number {
    if (!p || p <= 2) return 1;
    return p === 3 ? 2 : 3;
  }

  private dueFromTask(task: TodoistTask): string | null {
    const d = task.due?.date;
    return d ? d.slice(0, 10) : null;
  }

  private dateStr(d: any): string | null {
    if (!d) return null;
    if (typeof d === 'string') return d.slice(0, 10);
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    // colonna 'date': evita lo shift di fuso usando i componenti locali
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  private async api(owner: User, method: 'get' | 'post' | 'delete', path: string, data?: any): Promise<any> {
    const res = await axios.request({
      method,
      url: `${API}${path}`,
      data,
      headers: { Authorization: `Bearer ${owner.todoist_access_token}` },
      timeout: 15000,
    });
    return res.data;
  }

  private isNotFound(e: unknown): boolean {
    return (e as AxiosError)?.response?.status === 404;
  }

  private describe(e: unknown): string {
    const ax = e as AxiosError;
    if (ax?.response) return `${ax.response.status} ${JSON.stringify(ax.response.data)}`;
    return (e as Error)?.message || String(e);
  }
}

export const todoistService = new TodoistService();
