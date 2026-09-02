import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilitiesService } from './availabilities.service';

describe('AvailabilitiesService', () => {
  let service: AvailabilitiesService;
  let prisma: { availability: { create: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { availability: { create: jest.fn(), findMany: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [AvailabilitiesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AvailabilitiesService);
  });

  it('always creates the availability for the authenticated user', async () => {
    prisma.availability.create.mockResolvedValue({ id: 'avail-1' });

    await service.create('user-1', {
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    } as any);

    expect(prisma.availability.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1' }),
    });
  });

  it('forces an employee to only see their own availabilities, ignoring ?userId=', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'user-1', 'employee', 'someone-else');

    const call = prisma.availability.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe('user-1');
    expect(call.where.user).toEqual({ companyId: 'company-a' });
  });

  it('lets a manager filter by any userId within the company', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'manager-1', 'manager', 'user-2');

    expect(prisma.availability.findMany.mock.calls[0][0].where.userId).toBe('user-2');
  });

  it('lets a manager list every availability in the company when no userId is given', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await service.findAll('company-a', 'manager-1', 'manager', undefined);

    const call = prisma.availability.findMany.mock.calls[0][0];
    expect(call.where.userId).toBeUndefined();
    expect(call.where.user).toEqual({ companyId: 'company-a' });
  });
});
