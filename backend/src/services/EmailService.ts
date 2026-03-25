import { Resend } from 'resend';

export class EmailService {
  private resend: Resend;
  private fromAddress: string;

  constructor() {
    this.fromAddress = process.env.EMAIL_FROM || 'TradeFlow <onboarding@resend.dev>';
    this.resend = new Resend(process.env.RESEND_API_KEY || '');
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[EmailService] RESEND_API_KEY not set, skipping email');
      return;
    }
    const { error } = await this.resend.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
    });
    if (error) {
      console.error(`[EmailService] Resend error:`, error);
    } else {
      console.log(`[EmailService] Email sent to ${to}: ${subject}`);
    }
  }

  /**
   * Send task assignment notification email
   */
  async sendTaskAssignedEmail(
    assigneeEmail: string,
    assigneeName: string,
    task: {
      title: string;
      due_date: string;
      priority: number;
      client_name?: string;
      company_name?: string;
      assigned_by?: string;
    }
  ): Promise<void> {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://visit-tracker-pi.vercel.app';
      const priorityStars = '★'.repeat(task.priority) + '☆'.repeat(3 - task.priority);
      const priorityLabel = task.priority === 3 ? 'High' : task.priority === 2 ? 'Medium' : 'Low';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1a73e8, #0d47a1); color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .body { padding: 32px; }
    .greeting { font-size: 16px; color: #333; margin-bottom: 16px; }
    .task-card { background: #f8f9fa; border-left: 4px solid #1a73e8; border-radius: 4px; padding: 20px; margin: 20px 0; }
    .task-title { font-size: 18px; font-weight: 600; color: #1a237e; margin-bottom: 12px; }
    .task-detail { font-size: 14px; color: #555; margin: 8px 0; }
    .task-detail strong { color: #333; }
    .priority-stars { color: #f5a623; font-size: 16px; }
    .btn { display: inline-block; background: #1a73e8; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 20px; }
    .footer { background: #f4f6f9; padding: 16px 32px; font-size: 12px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Task Assigned</h1>
    </div>
    <div class="body">
      <p class="greeting">Hi ${assigneeName},</p>
      <p class="greeting">A new task has been assigned to you:</p>
      <div class="task-card">
        <div class="task-title">${task.title}</div>
        <div class="task-detail"><strong>Due Date:</strong> ${task.due_date || 'Not set'}</div>
        <div class="task-detail"><strong>Priority:</strong> <span class="priority-stars">${priorityStars}</span> (${priorityLabel})</div>
        ${task.client_name ? `<div class="task-detail"><strong>Client:</strong> ${task.client_name}</div>` : ''}
        ${task.company_name ? `<div class="task-detail"><strong>Company:</strong> ${task.company_name}</div>` : ''}
        ${task.assigned_by ? `<div class="task-detail"><strong>Assigned by:</strong> ${task.assigned_by}</div>` : ''}
      </div>
      <a href="${frontendUrl}/tasks" class="btn">View Tasks</a>
    </div>
    <div class="footer">
      This is an automated notification from TradeFlow. Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;

      await this.sendEmail(assigneeEmail, `New Task Assigned: ${task.title}`, html);
    } catch (error) {
      console.error(`[EmailService] Failed to send task assignment email to ${assigneeEmail}:`, (error as Error).message);
    }
  }

  /**
   * Send weekly task summary email
   */
  async sendWeeklyTaskSummary(
    userEmail: string,
    userName: string,
    completedTasks: any[],
    pendingTasks: any[]
  ): Promise<void> {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://visit-tracker-pi.vercel.app';
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const completedRows = completedTasks.length > 0
        ? completedTasks.map(t => `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${t.title}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '-'}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${t.client?.name || '-'}</td>
          </tr>`).join('')
        : '<tr><td colspan="3" style="padding: 16px; text-align: center; color: #999;">No tasks completed this week</td></tr>';

      const pendingRows = pendingTasks.length > 0
        ? pendingTasks.map(t => {
          const isOverdue = t.due_date && new Date(t.due_date) < today;
          const rowColor = isOverdue ? 'color: #d32f2f;' : '';
          const priorityStars = '★'.repeat(t.priority || 1) + '☆'.repeat(3 - (t.priority || 1));
          const statusLabel = t.status === 'in_progress' ? 'In Progress' : 'To Do';
          return `
          <tr style="${rowColor}">
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${t.title}${isOverdue ? ' (OVERDUE)' : ''}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${t.due_date ? new Date(t.due_date).toLocaleDateString() : 'Not set'}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;"><span style="color: #f5a623;">${priorityStars}</span></td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${t.client?.name || '-'}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #eee;">${statusLabel}</td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #999;">No pending tasks</td></tr>';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 700px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1a73e8, #0d47a1); color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .body { padding: 32px; }
    .greeting { font-size: 16px; color: #333; margin-bottom: 16px; }
    .section-title { font-size: 18px; font-weight: 600; color: #1a237e; margin: 24px 0 12px; border-bottom: 2px solid #e8eaf6; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #e8eaf6; color: #333; padding: 10px 12px; text-align: left; font-weight: 600; }
    .stats { display: flex; gap: 16px; margin: 16px 0; }
    .stat-box { background: #f8f9fa; border-radius: 6px; padding: 16px; flex: 1; text-align: center; }
    .stat-number { font-size: 28px; font-weight: 700; color: #1a73e8; }
    .stat-label { font-size: 12px; color: #777; margin-top: 4px; }
    .btn { display: inline-block; background: #1a73e8; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 20px; }
    .footer { background: #f4f6f9; padding: 16px 32px; font-size: 12px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Weekly Task Summary</h1>
    </div>
    <div class="body">
      <p class="greeting">Hi ${userName},</p>
      <p class="greeting">Here is your weekly task summary for ${dateStr}:</p>

      <div style="display: flex; gap: 16px; margin: 16px 0;">
        <div style="background: #e8f5e9; border-radius: 6px; padding: 16px; flex: 1; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #2e7d32;">${completedTasks.length}</div>
          <div style="font-size: 12px; color: #555; margin-top: 4px;">Completed</div>
        </div>
        <div style="background: #fff3e0; border-radius: 6px; padding: 16px; flex: 1; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #e65100;">${pendingTasks.length}</div>
          <div style="font-size: 12px; color: #555; margin-top: 4px;">Pending</div>
        </div>
        <div style="background: #ffebee; border-radius: 6px; padding: 16px; flex: 1; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #c62828;">${pendingTasks.filter(t => t.due_date && new Date(t.due_date) < today).length}</div>
          <div style="font-size: 12px; color: #555; margin-top: 4px;">Overdue</div>
        </div>
      </div>

      <h2 class="section-title">Completed This Week</h2>
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Completed</th>
            <th>Client</th>
          </tr>
        </thead>
        <tbody>
          ${completedRows}
        </tbody>
      </table>

      <h2 class="section-title">Pending Tasks</h2>
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Due Date</th>
            <th>Priority</th>
            <th>Client</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${pendingRows}
        </tbody>
      </table>

      <a href="${frontendUrl}/tasks" class="btn">View All Tasks</a>
    </div>
    <div class="footer">
      This is an automated weekly summary from TradeFlow. Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;

      await this.sendEmail(userEmail, `Weekly Task Summary - ${dateStr}`, html);
    } catch (error) {
      console.error(`[EmailService] Failed to send weekly summary email to ${userEmail}:`, (error as Error).message);
    }
  }

  /**
   * Send global team summary to master_admin (all users' tasks)
   */
  async sendTeamWeeklySummary(
    adminEmail: string,
    adminName: string,
    userSummaries: { userName: string; completed: any[]; pending: any[]; overdue: number }[]
  ): Promise<void> {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://visit-tracker-pi.vercel.app';
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const totalCompleted = userSummaries.reduce((s, u) => s + u.completed.length, 0);
      const totalPending = userSummaries.reduce((s, u) => s + u.pending.length, 0);
      const totalOverdue = userSummaries.reduce((s, u) => s + u.overdue, 0);

      const userSections = userSummaries.map(u => {
        const completedRows = u.completed.length > 0
          ? u.completed.map(t => `<tr>
              <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${t.title}</td>
              <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${t.client?.name || '-'}</td>
            </tr>`).join('')
          : '';

        const pendingRows = u.pending.length > 0
          ? u.pending.map(t => {
              const isOverdue = t.due_date && new Date(t.due_date) < today;
              const style = isOverdue ? 'color:#d32f2f;' : '';
              const stars = '★'.repeat(t.priority || 1) + '☆'.repeat(3 - (t.priority || 1));
              return `<tr style="${style}">
                <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${t.title}${isOverdue ? ' (OVERDUE)' : ''}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${t.due_date ? new Date(t.due_date).toLocaleDateString() : '-'}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#f5a623;">${stars}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${t.client?.name || '-'}</td>
              </tr>`;
            }).join('')
          : '';

        return `
          <div style="margin:20px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
            <div style="background:#e8eaf6;padding:12px 16px;font-size:16px;font-weight:600;color:#1a237e;">
              ${u.userName}
              <span style="float:right;font-size:13px;font-weight:400;color:#555;">
                ${u.completed.length} completed · ${u.pending.length} pending · <span style="color:${u.overdue > 0 ? '#d32f2f' : '#555'}">${u.overdue} overdue</span>
              </span>
            </div>
            <div style="padding:12px 16px;">
              ${completedRows ? `<div style="font-size:13px;font-weight:600;color:#2e7d32;margin-bottom:6px;">Completed</div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
                  <tr><th style="text-align:left;padding:6px 10px;background:#f1f8e9;font-size:12px;">Task</th><th style="text-align:left;padding:6px 10px;background:#f1f8e9;font-size:12px;">Client</th></tr>
                  ${completedRows}
                </table>` : ''}
              ${pendingRows ? `<div style="font-size:13px;font-weight:600;color:#e65100;margin-bottom:6px;">Pending</div>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><th style="text-align:left;padding:6px 10px;background:#fff3e0;font-size:12px;">Task</th><th style="text-align:left;padding:6px 10px;background:#fff3e0;font-size:12px;">Due</th><th style="text-align:left;padding:6px 10px;background:#fff3e0;font-size:12px;">Priority</th><th style="text-align:left;padding:6px 10px;background:#fff3e0;font-size:12px;">Client</th></tr>
                  ${pendingRows}
                </table>` : ''}
              ${!completedRows && !pendingRows ? '<p style="color:#999;font-size:13px;">No tasks</p>' : ''}
            </div>
          </div>`;
      }).join('');

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f4f6f9;margin:0;padding:0;">
  <div style="max-width:800px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#1a237e,#0d47a1);color:#fff;padding:24px 32px;">
      <h1 style="margin:0;font-size:22px;">Team Weekly Summary</h1>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;color:#333;">Hi ${adminName},</p>
      <p style="font-size:14px;color:#555;">Here is the team task overview for ${dateStr}:</p>

      <div style="display:flex;gap:16px;margin:16px 0;">
        <div style="background:#e8f5e9;border-radius:6px;padding:16px;flex:1;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#2e7d32;">${totalCompleted}</div>
          <div style="font-size:12px;color:#555;margin-top:4px;">Total Completed</div>
        </div>
        <div style="background:#fff3e0;border-radius:6px;padding:16px;flex:1;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#e65100;">${totalPending}</div>
          <div style="font-size:12px;color:#555;margin-top:4px;">Total Pending</div>
        </div>
        <div style="background:#ffebee;border-radius:6px;padding:16px;flex:1;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#c62828;">${totalOverdue}</div>
          <div style="font-size:12px;color:#555;margin-top:4px;">Total Overdue</div>
        </div>
      </div>

      ${userSections}

      <a href="${frontendUrl}/statistics" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;margin-top:20px;">View Statistics</a>
    </div>
    <div style="background:#f4f6f9;padding:16px 32px;font-size:12px;color:#999;text-align:center;">
      TradeFlow - Team Weekly Summary
    </div>
  </div>
</body>
</html>`;

      await this.sendEmail(adminEmail, `Team Weekly Summary - ${dateStr}`, html);
    } catch (error) {
      console.error(`[EmailService] Failed to send team summary to ${adminEmail}:`, (error as Error).message);
    }
  }
}
