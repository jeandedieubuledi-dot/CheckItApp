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

  // Un employé ne voit que les shifts où il a une assignation — jamais le
  // planning complet du site (filtré côté requête Prisma, pas juste caché
  // à l'affichage : un employé ne doit jamais recevoir les données des
  // shifts d'un collègue). Managers/admins continuent de voir tout le site.
  findAll(user: AuthenticatedUser, query: FindShiftsQueryDto) {
    const isEmployee = user.role === 'employee';

    return this.prisma.shift.findMany({
      where: {
        site: { companyId: user.companyId },
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(query.from || query.to
          ? {
              startsAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        ...(isEmployee ? { assignments: { some: { userId: user.userId } } } : {}),
      },
      include: {
        // Même filtrage sur les assignations incluses : un shift peut avoir
        // une assignation annulée appartenant à un autre employé (historique
        // de réassignation) — un employé ne doit jamais la voir non plus.
        assignments: { where: isEmployee ? { userId: user.userId } : undefined, include: { offers: true } },
      },
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

  // Marché de shifts : les offres d'échange encore ouvertes de toute
  // l'entreprise, visibles par n'importe quel employé pour qu'il puisse les
  // reprendre — sauf les siennes. Séparé de findAll (qui reste strictement
  // "mes shifts") pour ne pas faire fuiter le planning des collègues dans
  // l'écran Planning.
  async listOpenOffers(companyId: string, requesterId: string) {
    const offers = await this.prisma.shiftOffer.findMany({
      where: {
        status: 'open',
        offeredBy: { not: requesterId },
        shiftAssignment: { shift: { site: { companyId } } },
      },
      include: { shiftAssignment: { include: { shift: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return offers.map((offer) => ({
      id: offer.id,
      shiftId: offer.shiftAssignment.shiftId,
      shift: offer.shiftAssignment.shift,
      offeredBy: offer.offeredBy,
      createdAt: offer.createdAt,
    }));
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

    // Les heures d'une Availability ("HH:mm") sont déclarées en heure locale
    // du site ; le shift est stocké en UTC. Il faut le fuseau du site pour
    // comparer les deux sans décalage (voir ensureAvailable).
    const site = await this.prisma.site.findFirst({
      where: { id: shift.siteId, companyId },
      select: { timezone: true },
    });

    await this.ensureAvailable(dto.userId, shift.startsAt, shift.endsAt, site?.timezone ?? 'Europe/Brussels');
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

  // Le manager refuse l'échange : l'offre passe en 'rejected' (état
  // terminal) et l'assignation revient au propriétaire d'origine — s'il
  // veut retenter, il doit reproposer explicitement via offerAssignment.
  async rejectOffer(companyId: string, offerId: string) {
    const offer = await this.findOwnedOffer(companyId, offerId);

    if (!offer.requiresManagerApproval || offer.status !== 'accepted' || !offer.acceptedBy) {
      throw new BadRequestException("Cette offre n'attend pas de validation manager");
    }

    const [, updatedOffer] = await this.prisma.$transaction([
      this.prisma.shiftAssignment.update({
        where: { id: offer.shiftAssignmentId },
        data: { status: 'assigned' },
      }),
      this.prisma.shiftOffer.update({
        where: { id: offerId },
        data: { status: 'rejected', resolvedAt: new Date() },
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

  // Un manager ne peut pas assigner un shift à un employé qui a déclaré ne
  // pas être disponible ce jour-là (ou qui n'a rien déclaré du tout — on
  // bloque par défaut plutôt que d'assigner par erreur, voir brief). Une
  // disponibilité ponctuelle (specificDate) pour le jour exact prime sur
  // une disponibilité récurrente (dayOfWeek) du même jour.
  //
  // Le shift est stocké en UTC, mais les heures d'une Availability ("HH:mm")
  // et son jour de la semaine se raisonnent en heure LOCALE du site : on
  // ramène donc le shift dans le fuseau du site avant toute comparaison,
  // sinon un décalage d'1–2 h (heure d'hiver / d'été) fait rejeter des
  // créneaux valides le matin et accepter des créneaux invalides le soir.
  private async ensureAvailable(userId: string, startsAt: Date, endsAt: Date, timezone: string) {
    const start = zonedParts(startsAt, timezone);
    const end = zonedParts(endsAt, timezone);

    // Jour civil du shift dans le fuseau du site (minuit UTC de cette date) —
    // pour la recherche par specificDate et par jour de la semaine.
    const dayStart = new Date(Date.UTC(start.year, start.month - 1, start.day));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayOfWeek = start.weekday; // lundi = 0, même convention que le reste de l'app

    const specific = await this.prisma.availability.findFirst({
      where: { userId, specificDate: { gte: dayStart, lt: dayEnd } },
    });
    const availability =
      specific ??
      (await this.prisma.availability.findFirst({
        where: { userId, dayOfWeek, specificDate: null },
      }));

    const dateLabel = formatDate(dayStart);
    const shiftRangeLabel = `${formatMinutes(start.minutesOfDay)} et ${formatMinutes(end.minutesOfDay)}`;

    if (!availability || !availability.isAvailable) {
      throw new ConflictException(`Cet employé n'est pas disponible le ${dateLabel} entre ${shiftRangeLabel}`);
    }

    // Un shift de nuit peut finir le lendemain en heure locale — on place
    // alors la fin sur une échelle > 24 h pour la comparaison.
    const dayDiff = Math.round((Date.UTC(end.year, end.month - 1, end.day) - dayStart.getTime()) / 86_400_000);
    const shiftEndMinutes = end.minutesOfDay + dayDiff * 24 * 60;

    const availStartMinutes = parseHhmm(availability.startTime);
    const availEndMinutes = parseHhmm(availability.endTime);
    if (start.minutesOfDay < availStartMinutes || shiftEndMinutes > availEndMinutes) {
      throw new ConflictException(
        `Cet employé n'est disponible que de ${availability.startTime} à ${availability.endTime} le ${dateLabel}, ` +
          `en dehors du créneau du shift (${shiftRangeLabel})`,
      );
    }
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function formatMinutes(minutesOfDay: number): string {
  const m = ((minutesOfDay % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function parseHhmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

// Décompose un instant (Date UTC) dans un fuseau IANA donné (ex:
// "Europe/Brussels"), pour comparer un shift stocké en UTC aux heures
// locales déclarées dans une Availability.
function zonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
