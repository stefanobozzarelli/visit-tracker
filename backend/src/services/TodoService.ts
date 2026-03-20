import { AppDataSource } from '../config/database';
import { TodoItem } from '../entities/TodoItem';
import { TodoAttachment } from '../entities/TodoAttachment';

interface TodoFilters {
  status?: string;
  clientId?: string;
  companyId?: string;
  assignedToUserId?: string;
  overdue?: boolean;
  thisWeek?: boolean;
  next7Days?: boolean;
}

export class TodoService {
  private todoRepository = AppDataSource.getRepository(TodoItem);
  private attachmentRepository = AppDataSource.getRepository(TodoAttachment);

  async createTodo(
    title: string,
    clientId: string,
    companyId: string,
    assignedToUserId: string,
    createdByUserId: string,
    dueDate?: Date,
    visitReportId?: string,
    claimId?: string
  ): Promise<TodoItem> {
    const todo = this.todoRepository.create({
      title,
      client_id: clientId,
      company_id: companyId,
      assigned_to_user_id: assignedToUserId,
      created_by_user_id: createdByUserId,
      due_date: dueDate || null,
      visit_report_id: visitReportId || null,
      claim_id: claimId || null,
      status: 'todo',
    });
    return await this.todoRepository.save(todo);
  }

  async getTodos(filters?: TodoFilters): Promise<TodoItem[]> {
    let query = this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.assigned_to_user', 'assigned_user')
      .leftJoinAndSelect('todo.created_by_user', 'created_user')
      .leftJoinAndSelect('todo.client', 'client')
      .leftJoinAndSelect('todo.company', 'company')
      .leftJoinAndSelect('todo.attachments', 'attachments');

    if (filters?.status) {
      query = query.where('todo.status = :status', { status: filters.status });
    }

    if (filters?.clientId) {
      query = query.andWhere('todo.client_id = :clientId', { clientId: filters.clientId });
    }

    if (filters?.companyId) {
      query = query.andWhere('todo.company_id = :companyId', { companyId: filters.companyId });
    }

    if (filters?.assignedToUserId) {
      query = query.andWhere('todo.assigned_to_user_id = :userId', { userId: filters.assignedToUserId });
    }

    if (filters?.overdue) {
      const today = new Date().toISOString().split('T')[0];
      query = query.andWhere('todo.due_date < :today AND todo.due_date IS NOT NULL', { today });
    }

    if (filters?.thisWeek) {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const mondayStr = monday.toISOString().split('T')[0];
      const sundayStr = sunday.toISOString().split('T')[0];

      query = query.andWhere('todo.due_date BETWEEN :monday AND :sunday', { monday: mondayStr, sunday: sundayStr });
    }

    if (filters?.next7Days) {
      const today = new Date();
      const inSevenDays = new Date(today);
      inSevenDays.setDate(today.getDate() + 7);

      const todayStr = today.toISOString().split('T')[0];
      const sevenDaysStr = inSevenDays.toISOString().split('T')[0];

      query = query.andWhere('todo.due_date BETWEEN :today AND :sevenDays', { today: todayStr, sevenDays: sevenDaysStr });
    }

    return await query.orderBy('todo.due_date', 'ASC').addOrderBy('todo.created_at', 'DESC').getMany();
  }

  async getMyTodos(userId: string, filters?: TodoFilters): Promise<TodoItem[]> {
    // Show TODOs assigned TO THE USER or created BY THE USER
    let query = this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.assigned_to_user', 'assigned_user')
      .leftJoinAndSelect('todo.created_by_user', 'created_user')
      .leftJoinAndSelect('todo.client', 'client')
      .leftJoinAndSelect('todo.company', 'company')
      .where('todo.assigned_to_user_id = :userId OR todo.created_by_user_id = :userId', { userId });

    if (filters?.status) {
      query = query.andWhere('todo.status = :status', { status: filters.status });
    }

    if (filters?.clientId) {
      query = query.andWhere('todo.client_id = :clientId', { clientId: filters.clientId });
    }

    if (filters?.companyId) {
      query = query.andWhere('todo.company_id = :companyId', { companyId: filters.companyId });
    }

    if (filters?.overdue) {
      const today = new Date().toISOString().split('T')[0];
      query = query.andWhere('todo.due_date < :today AND todo.due_date IS NOT NULL', { today });
    }

    if (filters?.thisWeek) {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const mondayStr = monday.toISOString().split('T')[0];
      const sundayStr = sunday.toISOString().split('T')[0];

      query = query.andWhere('todo.due_date BETWEEN :monday AND :sunday', { monday: mondayStr, sunday: sundayStr });
    }

    if (filters?.next7Days) {
      const today = new Date();
      const inSevenDays = new Date(today);
      inSevenDays.setDate(today.getDate() + 7);

      const todayStr = today.toISOString().split('T')[0];
      const sevenDaysStr = inSevenDays.toISOString().split('T')[0];

      query = query.andWhere('todo.due_date BETWEEN :today AND :sevenDays', { today: todayStr, sevenDays: sevenDaysStr });
    }

    return await query.orderBy('todo.due_date', 'ASC').addOrderBy('todo.created_at', 'DESC').getMany();
  }

  async getTodoById(id: string): Promise<TodoItem | null> {
    return await this.todoRepository.findOne({
      where: { id },
      relations: ['assigned_to_user', 'created_by_user', 'client', 'company', 'visit_report', 'attachments'],
    });
  }

  async updateTodo(
    id: string,
    data: Partial<{
      title: string;
      status: 'todo' | 'in_progress' | 'done';
      due_date: Date;
      assigned_to_user_id: string;
    }>
  ): Promise<TodoItem> {
    await this.todoRepository.update(id, data);
    const updated = await this.getTodoById(id);
    if (!updated) throw new Error('Todo not found');
    return updated;
  }

  async deleteTodo(id: string): Promise<void> {
    await this.todoRepository.delete(id);
  }

  async getTodosByStatus(status: 'todo' | 'in_progress' | 'done'): Promise<TodoItem[]> {
    return await this.todoRepository.find({
      where: { status },
      relations: ['assigned_to_user', 'client', 'company'],
    });
  }

  async getOverdueTodos(): Promise<TodoItem[]> {
    const today = new Date().toISOString().split('T')[0];
    return await this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.assigned_to_user', 'assigned_user')
      .leftJoinAndSelect('todo.client', 'client')
      .leftJoinAndSelect('todo.company', 'company')
      .where('todo.due_date < :today AND todo.due_date IS NOT NULL', { today })
      .orderBy('todo.due_date', 'ASC')
      .getMany();
  }

  async getTodosThisWeek(): Promise<TodoItem[]> {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mondayStr = monday.toISOString().split('T')[0];
    const sundayStr = sunday.toISOString().split('T')[0];

    return await this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.assigned_to_user', 'assigned_user')
      .leftJoinAndSelect('todo.client', 'client')
      .leftJoinAndSelect('todo.company', 'company')
      .where('todo.due_date BETWEEN :monday AND :sunday', { monday: mondayStr, sunday: sundayStr })
      .orderBy('todo.due_date', 'ASC')
      .getMany();
  }

  async getTodosNext7Days(): Promise<TodoItem[]> {
    const today = new Date();
    const inSevenDays = new Date(today);
    inSevenDays.setDate(today.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysStr = inSevenDays.toISOString().split('T')[0];

    return await this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.assigned_to_user', 'assigned_user')
      .leftJoinAndSelect('todo.client', 'client')
      .leftJoinAndSelect('todo.company', 'company')
      .where('todo.due_date BETWEEN :today AND :sevenDays', { today: todayStr, sevenDays: sevenDaysStr })
      .orderBy('todo.due_date', 'ASC')
      .getMany();
  }

  async getTodosByClaimId(claimId: string): Promise<TodoItem[]> {
    return await this.todoRepository.find({
      where: { claim_id: claimId },
      relations: ['assigned_to_user', 'created_by_user', 'attachments'],
      order: { created_at: 'DESC' },
    });
  }

  // --- Attachment methods ---

  async addAttachment(todoId: string, userId: string, filename: string, fileSize: number, s3Key: string): Promise<TodoAttachment> {
    const attachment = this.attachmentRepository.create({
      todo_id: todoId,
      uploaded_by_user_id: userId,
      filename,
      file_size: fileSize,
      s3_key: s3Key,
    });
    return await this.attachmentRepository.save(attachment);
  }

  async getAttachments(todoId: string): Promise<TodoAttachment[]> {
    return await this.attachmentRepository.find({
      where: { todo_id: todoId },
      relations: ['uploaded_by_user'],
      order: { created_at: 'DESC' },
    });
  }

  async getAttachment(attachmentId: string): Promise<TodoAttachment | null> {
    return await this.attachmentRepository.findOne({
      where: { id: attachmentId },
    });
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.attachmentRepository.delete(attachmentId);
  }
}
