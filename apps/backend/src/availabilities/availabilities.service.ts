import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';

@Injectable()
export class AvailabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateAvailabilityDto) {
    return this.prisma.availability.create({
      data: {
        userId,
        dayOfWeek: dto.dayOfWeek,
        specificDate: dto.specificDate ? new Date(dto.specificDate) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isAvailable: dto.isAvailable ?? true,
      },
    });
  }

  findAll(companyId: string, requesterId: string, requesterRole: string, targetUserId?: string) {
    // Un employé ne voit que ses propres dispos ; un manager peut filtrer par
    // employé ou consulter toute l'entreprise pour construire le planning.
    const userId = requesterRole === 'employee' ? requesterId : targetUserId;

    return this.prisma.availability.findMany({
      where: {
        user: { companyId },
        ...(userId ? { userId } : {}),
      },
      orderBy: [{ dayOfWeek: 'asc' }, { specificDate: 'asc' }],
    });
  }
}
