import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  let service: ShiftsService;
  let prisma: {
    site: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    shift: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    shiftAssignment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    shiftOffer: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      site: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      shift: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      shiftAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      shiftOffer: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module = await Test.createTestingModule({
      providers: [ShiftsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ShiftsService);
  });

  describe('create', () => {
    it('refuses to create a shift on a site from another company', async () => {
      prisma.site.findFirst.mockResolvedValue(null);

      await expect(
        service.create('company-a', 'manager-1', {
          siteId: 'site-of-company-b',
          startsAt: '2026-09-01T08:00:00.000Z',
          endsAt: '2026-09-01T16:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });

    it('rejects a shift whose end is before its start', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });

      await expect(
        service.create('company-a', 'manager-1', {
          siteId: 'site-1',
          startsAt: '2026-09-02T04:00:00.000Z',
          endsAt: '2026-09-01T12:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });

    it('rejects a shift whose end equals its start', async () => {
      prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: 'company-a' });

      await expect(
        service.create('company-a', 'manager-1', {
          siteId: 'site-1',
          startsAt: '2026-09-01T08:00:00.000Z',
          endsAt: '2026-09-01T08:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const existingShift = {
      id: 'shift-1',
      startsAt: new Date('2026-09-01T08:00:00.000Z'),
      endsAt: new Date('2026-09-01T16:00:00.000Z'),
      assignments: [],
    };

    it('rejects moving endsAt before the existing startsAt (only endsAt provided)', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);

      await expect(
        service.update('company-a', 'shift-1', { endsAt: '2026-08-31T00:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });

    it('rejects moving startsAt past the existing endsAt (only startsAt provided)', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);

      await expect(
        service.update('company-a', 'shift-1', { startsAt: '2026-09-02T00:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });

    it('rejects a full reschedule (startsAt + endsAt) landing on an inverted range', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);

      await expect(
        service.update('company-a', 'shift-1', {
          startsAt: '2026-09-02T04:00:00.000Z',
          endsAt: '2026-09-01T12:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.shift.update).not.toHaveBeenCalled();
    });

    it('accepts a valid reschedule that shifts both boundaries by the same amount', async () => {
      prisma.shift.findFirst.mockResolvedValue(existingShift);
      prisma.shift.update.mockResolvedValue({ id: 'shift-1' });

      await service.update('company-a', 'shift-1', {
        startsAt: '2026-09-02T08:00:00.000Z',
        endsAt: '2026-09-02T16:00:00.000Z',
      });

      expect(prisma.shift.update).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
        data: {
          startsAt: new Date('2026-09-02T08:00:00.000Z'),
          endsAt: new Date('2026-09-02T16:00:00.000Z'),
        },
      });
    });
  });

  describe('remove', () => {
    it('refuses to delete a shift from another company', async () => {
      prisma.shift.findFirst.mockResolvedValue(null);

      await expect(service.remove('company-a', 'shift-of-company-b')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.shift.delete).not.toHaveBeenCalled();
    });

    it('cascades through offers and assignments before deleting the shift (avoids the FK violation)', async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: 'shift-1', assignments: [] });
      prisma.shiftAssignment.findMany.mockResolvedValue([{ id: 'assignment-1' }, { id: 'assignment-2' }]);
      prisma.shiftOffer.deleteMany.mockResolvedValue({ count: 0 });
      prisma.shiftAssignment.deleteMany.mockResolvedValue({ count: 2 });
      prisma.shift.delete.mockResolvedValue({ id: 'shift-1' });

      await service.remove('company-a', 'shift-1');

      expect(prisma.shiftOffer.deleteMany).toHaveBeenCalledWith({
        where: { shiftAssignmentId: { in: ['assignment-1', 'assignment-2'] } },
      });
      expect(prisma.shiftAssignment.deleteMany).toHaveBeenCalledWith({ where: { shiftId: 'shift-1' } });
      expect(prisma.shift.delete).toHaveBeenCalledWith({ where: { id: 'shift-1' } });
    });
  });

  describe('assign', () => {
    const shift1 = {
      id: 'shift-1',
      startsAt: new Date('2026-09-01T08:00:00.000Z'),
      endsAt: new Date('2026-09-01T16:00:00.000Z'),
      assignments: [],
    };

    it('refuses to assign a user from another company', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.assign('company-a', 'shift-1', { userId: 'user-of-company-b' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('rejects assigning a second employee to a shift that already has one', async () => {
      prisma.shift.findFirst.mockResolvedValue({
        ...shift1,
        assignments: [{ id: 'assignment-existing', userId: 'user-1', status: 'assigned' }],
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-2' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('allows assigning when the only existing assignment was cancelled', async () => {
      prisma.shift.findFirst.mockResolvedValue({
        ...shift1,
        assignments: [{ id: 'assignment-old', userId: 'user-1', status: 'cancelled' }],
      });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-new' });

      await service.assign('company-a', 'shift-1', { userId: 'user-2' });

      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-1', userId: 'user-2', status: 'assigned' },
      });
    });

    it('rejects assigning an employee who already has an overlapping shift', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-conflict',
        shift: {
          startsAt: new Date('2026-09-01T14:00:00.000Z'),
          endsAt: new Date('2026-09-01T22:00:00.000Z'),
        },
      });

      await expect(service.assign('company-a', 'shift-1', { userId: 'user-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled();
    });

    it('assigns successfully when the employee has no overlapping shift', async () => {
      prisma.shift.findFirst.mockResolvedValue(shift1);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      await service.assign('company-a', 'shift-1', { userId: 'user-1' });

      expect(prisma.shiftAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: { not: 'cancelled' },
          shiftId: { not: 'shift-1' },
          shift: { startsAt: { lt: shift1.endsAt }, endsAt: { gt: shift1.startsAt } },
        },
        include: { shift: true },
      });
      expect(prisma.shiftAssignment.create).toHaveBeenCalledWith({
        data: { shiftId: 'shift-1', userId: 'user-1', status: 'assigned' },
      });
    });
  });

  describe('offerAssignment', () => {
    it('rejects an employee offering an assignment that is not theirs', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1',
        userId: 'user-1',
        status: 'assigned',
      });

      await expect(
        service.offerAssignment(
          'company-a',
          { userId: 'user-2', companyId: 'company-a', role: 'employee' },
          'assignment-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.shiftOffer.create).not.toHaveBeenCalled();
    });

    it('rejects offering an assignment that is not in "assigned" status', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1',
        userId: 'user-1',
        status: 'offered',
      });

      await expect(
        service.offerAssignment(
          'company-a',
          { userId: 'user-1', companyId: 'company-a', role: 'employee' },
          'assignment-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates an open offer and flips the assignment to offered', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1',
        userId: 'user-1',
        status: 'assigned',
      });
      prisma.shiftOffer.create.mockResolvedValue({ id: 'offer-1', status: 'open' });
      prisma.shiftAssignment.update.mockResolvedValue({ id: 'assignment-1', status: 'offered' });

      const result = await service.offerAssignment(
        'company-a',
        { userId: 'user-1', companyId: 'company-a', role: 'employee' },
        'assignment-1',
      );

      expect(result).toEqual({ id: 'offer-1', status: 'open' });
      expect(prisma.shiftOffer.create).toHaveBeenCalledWith({
        data: { shiftAssignmentId: 'assignment-1', offeredBy: 'user-1', status: 'open' },
      });
      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { status: 'offered' },
      });
    });
  });

  describe('acceptOffer', () => {
    const shiftAssignment1 = {
      shiftId: 'shift-1',
      shift: {
        startsAt: new Date('2026-09-01T08:00:00.000Z'),
        endsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    };

    it('rejects a colleague accepting their own offer', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });

      await expect(
        service.acceptOffer(
          'company-a',
          { userId: 'user-1', companyId: 'company-a', role: 'employee' },
          'offer-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('rejects accepting an offer that is no longer open', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'accepted',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });

      await expect(
        service.acceptOffer(
          'company-a',
          { userId: 'user-2', companyId: 'company-a', role: 'employee' },
          'offer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects accepting when the colleague already has an overlapping shift', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-conflict',
        shift: {
          startsAt: new Date('2026-09-01T14:00:00.000Z'),
          endsAt: new Date('2026-09-01T22:00:00.000Z'),
        },
      });

      await expect(
        service.acceptOffer(
          'company-a',
          { userId: 'user-2', companyId: 'company-a', role: 'employee' },
          'offer-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('moves assignment to swap_pending when manager approval is required', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: true,
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.update.mockResolvedValue({ id: 'assignment-1', status: 'swap_pending' });
      prisma.shiftOffer.update.mockResolvedValue({ id: 'offer-1', status: 'accepted' });

      const result = await service.acceptOffer(
        'company-a',
        { userId: 'user-2', companyId: 'company-a', role: 'employee' },
        'offer-1',
      );

      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { status: 'swap_pending' },
      });
      expect(prisma.shiftOffer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: { acceptedBy: 'user-2', status: 'accepted' },
      });
      expect(result).toEqual({ id: 'offer-1', status: 'accepted' });
    });

    it('finalizes the swap immediately when no manager approval is required', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        offeredBy: 'user-1',
        status: 'open',
        shiftAssignmentId: 'assignment-1',
        requiresManagerApproval: false,
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.update.mockResolvedValue({ id: 'assignment-1', status: 'confirmed' });
      prisma.shiftOffer.update.mockResolvedValue({ id: 'offer-1', status: 'approved' });

      await service.acceptOffer(
        'company-a',
        { userId: 'user-2', companyId: 'company-a', role: 'employee' },
        'offer-1',
      );

      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { userId: 'user-2', status: 'confirmed' },
      });
      expect(prisma.shiftOffer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: expect.objectContaining({ acceptedBy: 'user-2', status: 'approved' }),
      });
    });
  });

  describe('approveOffer', () => {
    const shiftAssignment1 = {
      shiftId: 'shift-1',
      shift: {
        startsAt: new Date('2026-09-01T08:00:00.000Z'),
        endsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    };

    it('refuses to approve an offer not awaiting manager approval', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'open',
        requiresManagerApproval: true,
        acceptedBy: null,
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });

      await expect(service.approveOffer('company-a', 'offer-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('rejects approving when the accepted colleague now has an overlapping shift', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'accepted',
        requiresManagerApproval: true,
        acceptedBy: 'user-2',
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: 'assignment-conflict',
        shift: {
          startsAt: new Date('2026-09-01T14:00:00.000Z'),
          endsAt: new Date('2026-09-01T22:00:00.000Z'),
        },
      });

      await expect(service.approveOffer('company-a', 'offer-1')).rejects.toThrow(ConflictException);
      expect(prisma.shiftAssignment.update).not.toHaveBeenCalled();
    });

    it('reassigns the shift to the accepted colleague and confirms it', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        status: 'accepted',
        requiresManagerApproval: true,
        acceptedBy: 'user-2',
        shiftAssignmentId: 'assignment-1',
        shiftAssignment: shiftAssignment1,
      });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      prisma.shiftAssignment.update.mockResolvedValue({ id: 'assignment-1', status: 'confirmed' });
      prisma.shiftOffer.update.mockResolvedValue({ id: 'offer-1', status: 'approved' });

      await service.approveOffer('company-a', 'offer-1');

      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { userId: 'user-2', status: 'confirmed' },
      });
    });

    it('blocks approving an offer from another company', async () => {
      prisma.shiftOffer.findFirst.mockResolvedValue(null);

      await expect(service.approveOffer('company-a', 'offer-of-company-b')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
