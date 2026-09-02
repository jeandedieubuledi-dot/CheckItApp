import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
  });

  it('scopes findAll() by companyId and never selects passwordHash/pinCodeHash', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll('company-a');

    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ companyId: 'company-a' });
    expect(call.select.passwordHash).toBeUndefined();
    expect(call.select.pinCodeHash).toBeUndefined();
  });

  it('never returns a user belonging to another company', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.findOne('company-a', 'user-of-company-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-of-company-b', companyId: 'company-a' } }),
    );
  });

  it('blocks updateRole() on a user from another company before touching prisma.update', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateRole('company-a', 'user-of-company-b', { role: 'manager' as any }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects invite() when the email is already used, even across companies', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.invite('company-a', {
        email: 'taken@example.com',
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates invited users scoped to the caller companyId', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'new-user' });

    await service.invite('company-a', {
      email: 'new@example.com',
      firstName: 'A',
      lastName: 'B',
    });

    const call = prisma.user.create.mock.calls[0][0];
    expect(call.data.companyId).toBe('company-a');
    expect(call.data.status).toBe('invited');
  });

  describe('resolveByPin', () => {
    it('scopes candidates to companyId and only considers users with a PIN set', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.resolveByPin('company-a', '1234');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-a', pinCodeHash: { not: null } },
        select: { id: true, badgeCode: true, firstName: true, lastName: true, pinCodeHash: true },
      });
    });

    it('returns null when no candidate matches the PIN', async () => {
      const pinCodeHash = await bcrypt.hash('4321', 4);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', badgeCode: null, firstName: 'A', lastName: 'B', pinCodeHash },
      ]);

      const result = await service.resolveByPin('company-a', '0000');

      expect(result).toBeNull();
    });

    it('identifies the employee by PIN alone, without ever leaking the hash', async () => {
      const pinCodeHash = await bcrypt.hash('4321', 4);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          badgeCode: null,
          firstName: 'A',
          lastName: 'One',
          pinCodeHash: await bcrypt.hash('9999', 4),
        },
        { id: 'user-2', badgeCode: 'BADGE2', firstName: 'B', lastName: 'Two', pinCodeHash },
      ]);

      const result = await service.resolveByPin('company-a', '4321');

      expect(result).toEqual({ id: 'user-2', badgeCode: 'BADGE2', firstName: 'B', lastName: 'Two' });
    });
  });
});
