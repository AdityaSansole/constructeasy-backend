import { Test } from '@nestjs/testing';
import { CitiesService } from '../../src/modules/locations/cities/cities.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { NotFoundException } from '../../src/common/errors/domain.exception';

describe('CitiesService', () => {
  let service: CitiesService;
  const mockPrisma = { state: { findUnique: jest.fn() }, city: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CitiesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(CitiesService);
  });

  it('throws NotFoundException when the state does not exist', async () => {
    mockPrisma.state.findUnique.mockResolvedValue(null);
    await expect(service.findByState('invalid')).rejects.toThrow(NotFoundException);
  });

  it('returns active cities scoped to the requested state ordered by name', async () => {
    mockPrisma.state.findUnique.mockResolvedValue({ id: 'state-1' });
    mockPrisma.city.findMany.mockResolvedValue([]);

    await service.findByState('state-1');

    expect(mockPrisma.city.findMany).toHaveBeenCalledWith({
      where: { stateId: 'state-1', isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  });
});
