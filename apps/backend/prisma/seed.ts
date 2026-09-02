import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

// Le flow "accepter l'invitation" n'existe pas encore (voir UsersService.invite) :
// un utilisateur invité normalement reçoit un mot de passe temporaire aléatoire
// jamais communiqué, donc impossible de s'y connecter. Ce script crée des
// comptes de test avec des identifiants connus pour pouvoir tester les écrans
// checkin-mobile (staff ET manager) sans attendre ce flow.
async function main() {
  let company = await prisma.company.findFirst({ where: { name: 'Horaires Demo' } });
  if (!company) {
    company = await prisma.company.create({ data: { name: 'Horaires Demo' } });
  }

  let site = await prisma.site.findFirst({ where: { companyId: company.id, name: 'Site Bruxelles' } });
  if (!site) {
    site = await prisma.site.create({
      data: {
        companyId: company.id,
        name: 'Site Bruxelles',
        address: 'Rue de la Loi 1, 1000 Bruxelles',
      },
    });
  }

  const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);

  const manager = await prisma.user.upsert({
    where: { email: 'manager@test.local' },
    update: {},
    create: {
      companyId: company.id,
      email: 'manager@test.local',
      passwordHash,
      firstName: 'Marie',
      lastName: 'Manager',
      role: 'manager',
      status: 'active',
    },
  });

  const pinCodeHash = await bcrypt.hash('1234', SALT_ROUNDS);
  const employee = await prisma.user.upsert({
    where: { email: 'employee@test.local' },
    update: {},
    create: {
      companyId: company.id,
      email: 'employee@test.local',
      passwordHash,
      firstName: 'Eric',
      lastName: 'Employe',
      role: 'employee',
      status: 'active',
      pinCodeHash,
      badgeCode: 'BADGE-DEMO-001',
    },
  });

  // Un shift assigné à l'employé pour tester Planning / Marché de shifts
  // sans devoir tout construire à la main depuis web-manager.
  const existingShift = await prisma.shift.findFirst({
    where: { siteId: site.id, createdBy: manager.id },
  });
  if (!existingShift) {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 2);
    startsAt.setHours(9, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(17, 0, 0, 0);

    const shift = await prisma.shift.create({
      data: { siteId: site.id, startsAt, endsAt, status: 'published', createdBy: manager.id },
    });

    await prisma.shiftAssignment.create({
      data: { shiftId: shift.id, userId: employee.id, status: 'assigned' },
    });
  }

  console.log('Seed terminé.');
  console.log(`  Entreprise : ${company.name} (${company.id})`);
  console.log(`  Site       : ${site.name} (${site.id})`);
  console.log('  Manager    : manager@test.local / password123');
  console.log('  Employé    : employee@test.local / password123 (PIN 1234, badge BADGE-DEMO-001)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
