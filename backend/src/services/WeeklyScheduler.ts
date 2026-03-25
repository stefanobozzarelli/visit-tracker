import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { TodoItem } from '../entities/TodoItem';
import { EmailService } from './EmailService';

export class WeeklyScheduler {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  start(): void {
    // Run every Monday at 8:00 AM Rome time (Europe/Rome)
    cron.schedule('0 8 * * 1', async () => {
      console.log('[WeeklyScheduler] Running weekly task summary job...');
      await this.sendWeeklySummaries();
      console.log('[WeeklyScheduler] Weekly task summary job completed.');
    }, {
      timezone: 'Europe/Rome',
    });

    console.log('[WeeklyScheduler] Scheduled weekly task summary for Mondays at 08:00 Europe/Rome');
  }

  private async sendWeeklySummaries(): Promise<void> {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const todoRepository = AppDataSource.getRepository(TodoItem);

      // Get all users (no disabled field exists, so fetch all)
      const users = await userRepository.find();

      const now = new Date();
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);

      // Collect summaries for team report
      const userSummaries: { userName: string; completed: any[]; pending: any[]; overdue: number }[] = [];

      for (const user of users) {
        try {
          // Get tasks completed in the past week
          const completedTasks = await todoRepository
            .createQueryBuilder('todo')
            .leftJoinAndSelect('todo.client', 'client')
            .leftJoinAndSelect('todo.company', 'company')
            .where('todo.assigned_to_user_id = :userId', { userId: user.id })
            .andWhere('todo.status = :status', { status: 'done' })
            .andWhere('todo.updated_at >= :oneWeekAgo', { oneWeekAgo: oneWeekAgo.toISOString() })
            .orderBy('todo.updated_at', 'DESC')
            .getMany();

          // Get pending tasks (not done)
          const pendingTasks = await todoRepository
            .createQueryBuilder('todo')
            .leftJoinAndSelect('todo.client', 'client')
            .leftJoinAndSelect('todo.company', 'company')
            .where('todo.assigned_to_user_id = :userId', { userId: user.id })
            .andWhere('todo.status != :status', { status: 'done' })
            .orderBy('todo.due_date', 'ASC')
            .getMany();

          const overdueCount = pendingTasks.filter(t => t.due_date && new Date(t.due_date) < now).length;

          // Collect for team summary
          if (completedTasks.length > 0 || pendingTasks.length > 0) {
            userSummaries.push({
              userName: user.name,
              completed: completedTasks,
              pending: pendingTasks,
              overdue: overdueCount,
            });
          }

          // Send individual summary
          if (completedTasks.length > 0 || pendingTasks.length > 0) {
            this.emailService.sendWeeklyTaskSummary(
              user.email,
              user.name,
              completedTasks,
              pendingTasks
            ).catch(err => console.error(`[WeeklyScheduler] Error sending summary to ${user.email}:`, err.message));
          }
        } catch (userError) {
          console.error(`[WeeklyScheduler] Error processing user ${user.email}:`, (userError as Error).message);
        }
      }

      // Send team summary to all master_admin users
      const masterAdmins = users.filter(u => u.role === 'master_admin');
      for (const admin of masterAdmins) {
        this.emailService.sendTeamWeeklySummary(
          admin.email,
          admin.name,
          userSummaries
        ).catch(err => console.error(`[WeeklyScheduler] Error sending team summary to ${admin.email}:`, err.message));
      }
    } catch (error) {
      console.error('[WeeklyScheduler] Error in sendWeeklySummaries:', (error as Error).message);
    }
  }
}
