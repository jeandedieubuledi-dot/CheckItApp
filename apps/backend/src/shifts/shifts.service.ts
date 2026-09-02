import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/current-user.decorator';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { FindShiftsQueryDto } from './dto/find-shifts-query.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, createdBy: string, dto: CreateShiftDto) {
    const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, companyId } });
    if (!site) {
      throw new NotFoundException('Site introuvable');
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException("L'heure de fin doit être après l'heure de début");
    }

    return this.prisma.shift.create({
      data: {
        siteId: dto.siteId,
        startsAt,
        endsAt,
        roleNeeded: dto.roleNeeded,
        status: dto.status ?? 'draft',
        createdBy,
      },
    });
  }

  findAll(companyId: string, query: FindShiftsQueryDto) {
    return this.prisma.shift.findMany({
      where: {
        site: { companyId },
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(query.from || query.to
          ? {
              startsAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: { assignments: { include: { offers: true } } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, site: { companyId } },
      include: { assignments: { include: { offers: true } } },
    });
    if (!shift) {
      throw new NotFoundException('Shift introuvable');
    }
    return shift;
  }

  async update(companyId: string, id: string, dto: UpdateShiftDto) {
    const existing = await this.findOne(companyId, id);
    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, companyId } });
      if (!site) {
        throw new NotFoundException('Site introuvable');
      }
    }

    // Valide l'état final (pas juste les champs fournis) : un PATCH qui ne
    // touche qu'un seul des deux bords pourrait sinon rendre l'intervalle
    // invalide par rapport à l'autre bord resté inchangé.
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException("L'heure de fin doit être après l'heure de début");
    }

    return this.prisma.shift.update({
      where: { id },
      data: {
        ...(dto.siteId ? { siteId: dto.siteId } : {}),
        ...(dto.startsAt ? { startsAt } : {}),
        ...(dto.endsAt ? { endsAt } : {}),
        ...(dto.roleNeeded !== undefined ? { roleNeeded: dto.roleNeeded } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  // Supprimer un shift qui a des assignations violerait la contrainte de clé
  // étrangère (ShiftAssignment.shiftId) — on supprime la chaîne complète
  // (offres -> assignations -> shift) en une transaction plutôt que de
  // planter en 500.
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);

    const assignments = await this.prisma.shiftAssignment.findMany({
      where: { shiftId: id },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id);

    await this.prisma.$transaction([
      this.prisma.shiftOffer.deleteMany({ where: { shiftAssignmentId: { in: assignmentIds } } }),
      this.prisma.shiftAssignment.deleteMany({ where: { shiftId: id } }),
      this.prisma.shift.delete({ where: { id } }),
    ]);
  }

  // Un shift = un seul employé assigné à la fois.
  async assign(companyId: string, shiftId: string, dto: AssignShiftDto) {
    const shift = await this.findOne(companyId, shiftId);

    const activeAssignment = shift.assignments.find((a) => a.status !== 'cancelled');
    if (activeAssignment) {
      throw new ConflictException('Ce shift est déjà assigné à un autre employé');
    }

    const employee = await this.prisma.user.findFirst({ where: { id: dto.userId, companyId } });
    if (!employee) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    await this.ensureNoOverlap(dto.userId, shift.startsAt, shift.endsAt, shiftId);

    return this.prisma.shiftAssignment.create({
      data: { shiftId, userId: dto.userId, status: 'assigned' },
    });
  }

  async offerAssignment(companyId: string, employee: AuthenticatedUser, assignmentId: string) {
    const assignment = await this.findOwnedAssignment(companyId, assignmentId);

    if (assignment.userId !== employee.userId) {
      throw new ForbiddenException("Ce shift n'est pas assigné à cet utilisateur");
    }
    if (assignment.status !== 'assigned') {
      throw new BadRequestException('Ce shift ne peut pas être proposé dans son état actuel');
    }

    const [offer] = await this.prisma.$transaction([
      this.prisma.shiftOffer.create({
        data: { shiftAssignmentId: assignmentId, offeredBy: employee.userId, status: 'open' },
      }),
      this.prisma.shiftAssignment.update({
        where: { id: assignmentId },
        data: { status: 'offered' },
      }),
    ]);

    return offer;
  }

  async acceptOffer(companyId: string, colleague: AuthenticatedUser, offerId: string) {
    const offer = await this.findOwnedOffer(companyId, offerId);

    if (offer.status !== 'open') {
      throw new BadRequestException("Cette offre n'est plus disponible");
    }
    if (offer.offeredBy === colleague.userId) {
      throw new ForbiddenException("Impossible d'accepter sa propre offre");
    }

    await this.ensureNoOverlap(
      colleague.userId,
      offer.shiftAssignment.shift.startsAt,
      offer.shiftAssignment.shift.endsAt,
      offer.shiftAssignment.shiftId,
    );

    if (!offer.requiresManagerApproval) {
      const [, updatedOffer] = await this.prisma.$transaction([
        this.prisma.shiftAssignment.update({
          where: { id: offer.shiftAssignmentId },
          data: { userId: colleague.userId, status: 'confirmed' },
        }),
        this.prisma.shiftOffer.update({
          where: { id: offerId },
          data: { acceptedBy: colleague.userId, status: 'approved', resolvedAt: new Date() },
        }),
      ]);
      return updatedOffer;
    }

    const [, updatedOffer] = await this.prisma.$transaction([
      this.prisma.shiftAssignment.update({
        where: { id: offer.shiftAssignmentId },
        data: { status: 'swap_pending' },
      }),
      this.prisma.shiftOffer.update({
        where: { id: offerId },
        data: { acceptedBy: colleague.userId, status: 'accepted' },
      }),
    ]);

    return updatedOffer;
  }

  async approveOffer(companyId: string, offerId: string) {
    const offer = await this.findOwnedOffer(companyId, offerId);

    if (!offer.requiresManagerApproval || offer.status !== 'accepted' || !offer.acceptedBy) {
      throw new BadRequestException("Cette offre n'attend pas de validation manager");
    }

    // Re-vérifié à l'approbation : l'employé a pu être assigné ailleurs entre
    // son acceptation et la validation manager.
    await this.ensureNoOverlap(
      offer.acceptedBy,
      offer.shiftAssignment.shift.startsAt,
      offer.shiftAssignment.shift.endsAt,
      offer.shiftAssignment.shiftId,
    );

    const [, updatedOffer] = await this.prisma.$transaction([
      this.prisma.shiftAssignment.update({
        where: { id: offer.shiftAssignmentId },
        data: { userId: offer.acceptedBy, status: 'confirmed' },
      }),
      this.prisma.shiftOffer.update({
        where: { id: offerId },
        data: { status: 'approved', resolvedAt: new Date() },
      }),
    ]);

    return updatedOffer;
  }

  private async findOwnedAssignment(companyId: string, id: string) {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { id, shift: { site: { companyId } } },
    });
    if (!assignment) {
      throw new NotFoundException('Assignation introuvable');
    }
    return assignment;
  }

  private async findOwnedOffer(companyId: string, id: string) {
    const offer = await this.prisma.shiftOffer.findFirst({
      where: { id, shiftAssignment: { shift: { site: { companyId } } } },
      include: { shiftAssignment: { include: { shift: true } } },
    });
    if (!offer) {
      throw new NotFoundException('Offre introuvable');
    }
    return offer;
  }

  // Un employé ne peut pas être sur deux shifts qui se chevauchent dans le
  // temps, quel que soit le site — vérifié à l'assignation directe, à
  // l'acceptation d'une offre d'échange, et à nouveau à l'approbation manager.
  private async ensureNoOverlap(userId: string, startsAt: Date, endsAt: Date, excludeShiftId: string) {
    const conflict = await this.prisma.shiftAssignment.findFirst({
      where: {
        userId,
        status: { not: 'cancelled' },
        shiftId: { not: excludeShiftId },
        shift: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      },
      include: { shift: true },
    });

    if (conflict) {
      throw new ConflictException(
        `Cet employé a déjà un shift sur ce créneau (${conflict.shift.startsAt.toISOString()} → ${conflict.shift.endsAt.toISOString()})`,
      );
    }
  }
}
