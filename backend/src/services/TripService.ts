import { AppDataSource } from '../config/database';
import { Trip } from '../entities/Trip';

const ADMIN_ROLES = ['admin', 'master_admin'];

export class TripService {
  private tripRepo = AppDataSource.getRepository(Trip);

  async getTrips(userId: string, role: string): Promise<Trip[]> {
    if (ADMIN_ROLES.includes(role)) {
      return this.tripRepo.find({
        relations: ['user'],
        order: { startDate: 'DESC' },
      });
    }
    return this.tripRepo.find({
      where: { userId },
      order: { startDate: 'DESC' },
    });
  }

  async getTripById(id: string, userId: string, role: string): Promise<Trip | null> {
    if (ADMIN_ROLES.includes(role)) {
      return this.tripRepo.findOne({ where: { id }, relations: ['user'] });
    }
    return this.tripRepo.findOne({ where: { id, userId } });
  }

  async createTrip(data: Partial<Trip>, userId: string): Promise<Trip> {
    const trip = this.tripRepo.create({
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      destination: data.destination,
      notes: data.notes,
      days: data.days || [],
      userId,
    });
    return this.tripRepo.save(trip);
  }

  async updateTrip(id: string, data: Partial<Trip>, userId: string, role: string): Promise<Trip | null> {
    const trip = await this.getTripById(id, userId, role);
    if (!trip) return null;
    if (data.name !== undefined) trip.name = data.name;
    if (data.startDate !== undefined) trip.startDate = data.startDate;
    if (data.endDate !== undefined) trip.endDate = data.endDate;
    if (data.destination !== undefined) trip.destination = data.destination;
    if (data.notes !== undefined) trip.notes = data.notes;
    if (data.days !== undefined) trip.days = data.days;
    return this.tripRepo.save(trip);
  }

  async deleteTrip(id: string, userId: string, role: string): Promise<boolean> {
    const trip = await this.getTripById(id, userId, role);
    if (!trip) return false;
    await this.tripRepo.remove(trip);
    return true;
  }
}
