import { Test } from '@nestjs/testing';
import { LocalitiesService } from '../../src/modules/locations/localities/localities.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { NotFoundException } from '../../src/common/errors/domain.exception';
import { PaginationQueryDto } from '../../src/common/dto/pagination.dto';

describe('LocalitiesService', () => {
  let service: LocalitiesService;
  const mockPrisma = {
    city: { findUnique: jest.fn() },
    locality: { findMany: jest.fn(), count: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [LocalitiesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(LocalitiesService);
  });

  it('throws NotFoundException when the city does not exist', async () => {
    mockPrisma.city.findUnique.mockResolvedValue(null);
    await expect(service.findByCity('invalid-city', new PaginationQueryDto())).rejects.toThrow(NotFoundException);
  });

  it('returns paginated localities and total count for a city', async () => {
    mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1' });
    mockPrisma.locality.findMany.mockResolvedValue([{ id: 'l1', name: 'Kothrud', slug: 'kothrud' }]);
    mockPrisma.locality.count.mockResolvedValue(1);

    const result = await service.findByCity('city-1', new PaginationQueryDto());

    expect(result).toEqual({
      items: [{ id: 'l1', name: 'Kothrud', slug: 'kothrud' }],
      meta: expect.objectContaining({ page: 1, page_size: 20, total_count: 1, total_pages: 1 }),
    });
    expect(mockPrisma.locality.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cityId: 'city-1' } }));
  });
});
