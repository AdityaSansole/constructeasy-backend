import { Test } from '@nestjs/testing';
import { StatesService } from '../../src/modules/locations/states/states.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { NotFoundException } from '../../src/common/errors/domain.exception';

describe('StatesService', () => {
  let service: StatesService;
  const mockPrisma = { country: { findUnique: jest.fn() }, state: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [StatesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(StatesService);
  });

  it('throws NotFoundException when the requested country does not exist', async () => {
    mockPrisma.country.findUnique.mockResolvedValue(null);
    await expect(service.findByCountry('invalid-id')).rejects.toThrow(NotFoundException);
  });

  it('returns states scoped to the requested country ordered by name', async () => {
    mockPrisma.country.findUnique.mockResolvedValue({ id: 'country-1' });
    mockPrisma.state.findMany.mockResolvedValue([]);

    await service.findByCountry('country-1');

    expect(mockPrisma.state.findMany).toHaveBeenCalledWith({
      where: { countryId: 'country-1' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
  });
});
