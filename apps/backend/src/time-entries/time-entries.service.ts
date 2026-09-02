import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { TimeEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../auth/current-user.decorator';
import { AuthenticatedDevice } from '../site-devices/current-device.decorator';
import { CreateDeviceTimeEntryDto } from './dto/create-device-time-entry.dto';
import { CreateSelfTimeEntryDto } from './dto/create-self-time-entry.dto';
import { CreateManualTimeEntryDto } from './dto/create-manual-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { FindTimeEntriesQueryDto } from './dto/find-time-entries-query.dto';

const PRESENCE_TYPES: TimeEntryType[] = ['clock_in', 'clock_out'];

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  // Le kiosk n'a pas accès à /sites/:id/presence (réservé aux managers) pour
  // décider lui-même arrivée/départ — le serveur bascule donc automatiquement
  // clock_in/clock_out selon le dernier pointage de cet employé sur ce site.
  async createFromDevice(device: AuthenticatedDevice, dto: CreateDeviceTimeEntryDto) {
    const user = await this.resolveDeviceUser(device, dto);
    const type = await this.nextClockType(user.id, device.siteId);

    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: user.id,
        siteId: device.siteId,
        deviceId: device.deviceId,
        type,
        timestamp: new Date(),
        source: dto.source,
      },
    });

    return { ...entry, employee: { firstName: user.firstName, lastName: user.lastName } };
  }

  async createSelf(user: AuthenticatedUser, dto: CreateSelfTimeEntryDto) {
    let siteId: string;
    let deviceId: string | undefined;

    if (dto.source === 'qr_scan_own_phone') {
      const device = await this.prisma.siteDevice.findFirst({
        where: { id: dto.deviceId, site: { companyId: user.companyId } },
      });
      if (!device) {
        throw new NotFoundException('Terminal introuvable');
      }
      siteId = device.siteId;
      deviceId = device.id;
    } else {
      const site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, companyId: user.companyId },
      });
      if (!site) {
        throw new NotFoundException('Site introuvable');
      }
      siteId = site.id;
    }

    return this.prisma.timeEntry.create({
      data: {
        userId: user.userId,
        siteId,
        deviceId,
        type: dto.type,
        timestamp: new Date(),
        geoLat: dto.source === 'gps' ? dto.geoLat : undefined,
        geoLng: dto.source === 'gps' ? dto.geoLng : undefined,
        source: dto.source,
      },
    });
  }

  async createManual(manager: AuthenticatedUser, dto: CreateManualTimeEntryDto) {
    const [site, targetUser] = await Promise.all([
      this.prisma.site.findFirst({ where: { id: dto.siteId, companyId: manager.companyId } }),
      this.prisma.user.findFirst({ where: { id: dto.userId, companyId: manager.companyId } }),
    ]);
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }
    if (!targetUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return this.prisma.timeEntry.create({
      data: {
        userId: dto.userId,
        siteId: dto.siteId,
        type: dto.type,
        timestamp: new Date(),
        source: 'manual_by_manager',
        createdBy: manager.userId,
        creationReason: dto.creationReason,
      },
    });
  }

  findAll(requester: AuthenticatedUser, query: FindTimeEntriesQueryDto) {
    // Un employé ne voit que ses propres pointages, quel que soit ?userId=.
    const targetUserId = requester.role === 'employee' ? requester.userId : query.userId;

    return this.prisma.timeEntry.findMany({
      where: {
        site: { companyId: requester.companyId },
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...(query.from || query.to
          ? {
              timestamp: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  async update(companyId: string, managerId: string, id: string, dto: UpdateTimeEntryDto) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, site: { companyId } },
    });
    if (!entry) {
      throw new NotFoundException('Pointage introuvable');
    }

    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.timestamp ? { timestamp: new Date(dto.timestamp) } : {}),
        isEdited: true,
        editedBy: managerId,
        editReason: dto.editReason,
      },
    });
  }

  async getPresence(companyId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: { siteId, type: { in: PRESENCE_TYPES } },
      orderBy: { timestamp: 'asc' },
      select: { userId: true, type: true },
    });

    const lastStateByUser = new Map<string, TimeEntryType>();
    for (const entry of entries) {
      lastStateByUser.set(entry.userId, entry.type);
    }

    const presentUserIds = [...lastStateByUser.entries()]
      .filter(([, type]) => type === 'clock_in')
      .map(([userId]) => userId);

    if (presentUserIds.length === 0) {
      return [];
    }

    return this.prisma.user.findMany({
      where: { id: { in: presentUserIds } },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  private async resolveDeviceUser(device: AuthenticatedDevice, dto: CreateDeviceTimeEntryDto) {
    if (dto.source === 'badge_scan') {
      const user = await this.prisma.user.findFirst({
        where: { badgeCode: dto.badgeCode, companyId: device.companyId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!user) {
        throw new UnauthorizedException('Badge inconnu');
      }
      return user;
    }

    const user = await this.usersService.resolveByPin(device.companyId, dto.pin ?? '');
    if (!user) {
      throw new UnauthorizedException('PIN invalide');
    }
    return user;
  }

  private async nextClockType(userId: string, siteId: string): Promise<TimeEntryType> {
    const last = await this.prisma.timeEntry.findFirst({
      where: { userId, siteId, type: { in: PRESENCE_TYPES } },
      orderBy: { timestamp: 'desc' },
      select: { type: true },
    });
    return last?.type === 'clock_in' ? 'clock_out' : 'clock_in';
  }
}
