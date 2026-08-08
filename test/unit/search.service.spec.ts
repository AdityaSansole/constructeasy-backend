import { Test } from '@nestjs/testing';
import { SearchService } from '../../src/modules/search/search.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { S3Service } from '../../src/infrastructure/storage/s3.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { VerificationLevel } from '@prisma/client';
import { SearchProfessionalsDto } from '../../src/modules/search/dto/search-professionals.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../src/common/errors/domain.exception';

describe('SearchService', () => {
  let service: SearchService;

  const mockPrisma = {
    professionalProfile: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    portfolioProject: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockS3 = {
    generateDownloadUrl: jest.fn().mockResolvedValue({ downloadUrl: 'https://s3.pub/image.jpg' }),
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockS3.generateDownloadUrl.mockResolvedValue({ downloadUrl: 'https://s3.pub/image.jpg' });
    mockRedis.get.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = moduleRef.get(SearchService);
  });

  describe('searchProfessionals', () => {
    it('returns cached results if present in Redis', async () => {
      const cachedResult = {
        items: [{ id: 'prof-1', businessName: 'Cached Arch' }],
        meta: { page: 1, page_size: 20, total_count: 1, total_pages: 1 },
      };
      mockRedis.get.mockResolvedValue(cachedResult);

      const res = await service.searchProfessionals(new SearchProfessionalsDto());
      expect(res).toEqual(cachedResult);
      expect(mockPrisma.professionalProfile.findMany).not.toHaveBeenCalled();
    });

    it('queries database with trust-first ordering and caches result on cache miss', async () => {
      mockPrisma.professionalProfile.count.mockResolvedValue(1);
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        {
          id: 'prof-1',
          businessName: 'Apex Builders',
          slug: 'apex-builders',
          verificationLevel: VerificationLevel.level_2,
          averageRating: 4.8,
          reviewCount: 12,
          projectCount: 5,
          primaryLocality: {
            id: 'loc-1',
            name: 'Bandra',
            city: { id: 'c-1', name: 'Mumbai', slug: 'mumbai', state: { name: 'Maharashtra' } },
          },
          categoryMap: [{ category: { id: 'cat-1', name: 'Architect', slug: 'architect' } }],
          portfolioProjects: [],
        },
      ]);

      const dto = Object.assign(new SearchProfessionalsDto(), { q: 'Apex' });
      const res = await service.searchProfessionals(dto);
      expect(res.items.length).toBe(1);
      expect(res.items[0].businessName).toBe('Apex Builders');
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('compareProfessionals', () => {
    it('throws ValidationException if duplicate identifiers are provided', async () => {
      await expect(
        service.compareProfessionals({ identifiers: ['prof-1', 'prof-1'] }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException if fewer than 2 distinct identifiers are provided', async () => {
      await expect(
        service.compareProfessionals({ identifiers: ['prof-1'] }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException if more than 4 distinct identifiers are provided', async () => {
      await expect(
        service.compareProfessionals({
          identifiers: ['p1', 'p2', 'p3', 'p4', 'p5'],
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('returns whitelisted comparison payloads for valid 2..4 distinct professionals', async () => {
      mockPrisma.professionalProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          businessName: 'Arch 1',
          slug: 'arch-1',
          verificationLevel: VerificationLevel.level_1,
          averageRating: 4.5,
        },
        {
          id: 'p2',
          businessName: 'Arch 2',
          slug: 'arch-2',
          verificationLevel: VerificationLevel.level_2,
          averageRating: 4.9,
        },
      ]);

      const res = await service.compareProfessionals({ identifiers: ['p1', 'p2'] });
      expect(res.length).toBe(2);
      expect(res[0].businessName).toBe('Arch 1');
      expect(res[1].businessName).toBe('Arch 2');
    });
  });

  describe('getPublicProfessionalDetail', () => {
    it('throws NotFoundException for missing or unpublished professional', async () => {
      mockPrisma.professionalProfile.findFirst.mockResolvedValue(null);
      await expect(service.getPublicProfessionalDetail('missing-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
