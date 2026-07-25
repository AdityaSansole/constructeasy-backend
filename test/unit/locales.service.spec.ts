import { Test } from '@nestjs/testing';
import { LocalesService } from '../../src/modules/lookups/locales/locales.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

describe('LocalesService', () => {
  let service: LocalesService;
  const mockPrisma = { locale: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [LocalesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(LocalesService);
  });

  it('returns only active locales ordered by name', async () => {
    mockPrisma.locale.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(mockPrisma.locale.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });
  });
});
