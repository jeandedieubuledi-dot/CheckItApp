import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { SetPinDto } from './dto/set-pin.dto';

const SALT_ROUNDS = 12;

// Champs sûrs à renvoyer au client — jamais passwordHash ni pinCodeHash.
const SAFE_USER_SELECT = {
  id: true,
  companyId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  badgeCode: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.user.findMany({ where: { companyId }, select: SAFE_USER_SELECT });
  }

  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: SAFE_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  async invite(companyId: string, dto: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    // Pas encore de flow "accepter l'invitation" : on génère un mot de passe
    // temporaire aléatoire, jamais communiqué, en attendant que ce flow existe.
    const temporaryPassword = randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        companyId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? 'employee',
        status: 'invited',
        passwordHash,
      },
      select: SAFE_USER_SELECT,
    });
  }

  async updateRole(companyId: string, id: string, dto: UpdateUserRoleDto) {
    await this.findOne(companyId, id);
    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: SAFE_USER_SELECT,
    });
  }

  async regenerateBadge(companyId: string, id: string) {
    await this.findOne(companyId, id);
    const badgeCode = randomBytes(8).toString('hex');
    return this.prisma.user.update({
      where: { id },
      data: { badgeCode },
      select: SAFE_USER_SELECT,
    });
  }

  async setPin(companyId: string, id: string, dto: SetPinDto) {
    await this.findOne(companyId, id);
    const pinCodeHash = await bcrypt.hash(dto.pin, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { pinCodeHash } });
    return { ok: true };
  }

  // Un kiosk n'a qu'un clavier numérique : le PIN doit identifier l'employé
  // à lui seul (pas de sélection préalable dans un annuaire). Les PIN sont
  // hashés donc pas de lookup direct — on compare contre chaque employé de
  // l'entreprise qui en a un ; acceptable à l'échelle d'une PME (20-100 pers).
  async resolveByPin(companyId: string, pin: string) {
    const candidates = await this.prisma.user.findMany({
      where: { companyId, pinCodeHash: { not: null } },
      select: { id: true, badgeCode: true, firstName: true, lastName: true, pinCodeHash: true },
    });

    for (const candidate of candidates) {
      if (candidate.pinCodeHash && (await bcrypt.compare(pin, candidate.pinCodeHash))) {
        return {
          id: candidate.id,
          badgeCode: candidate.badgeCode,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
        };
      }
    }
    return null;
  }
}
