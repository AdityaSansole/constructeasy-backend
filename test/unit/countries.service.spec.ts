import { Test } from '@nestjs/testing';
import { CountriesService } from '../../src/modules/locations/countries/countries.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

describe('CountriesService', () => {
  let service: CountriesService;
  const mockPrisma = { country: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CountriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(CountriesService);
  });

  it('maps isoCode to iso_code in the response', async () => {
    mockPrisma.country.findMany.mockResolvedValue([{ id: 'c1', name: 'India', isoCode: 'IN' }]);
    const result = await service.findAll();
    expect(result).toEqual([{ id: 'c1', name: 'India', iso_code: 'IN' }]);
  });

  it('queries countries ordered by name and selects public fields', async () => {
    mockPrisma.country.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(mockPrisma.country.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isoCode: true },
    });
  });
});
