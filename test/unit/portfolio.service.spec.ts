import { Test } from '@nestjs/testing';
import { PortfolioService } from '../../src/modules/portfolio/portfolio.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { S3Service } from '../../src/infrastructure/storage/s3.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import {
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../src/common/errors/domain.exception';

describe('PortfolioService', () => {
  let service: PortfolioService;

  const mockPrisma = {
    professionalProfile: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    locality: {
      findUnique: jest.fn(),
    },
    portfolioProject: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockS3 = {
    generateDownloadUrl: jest.fn().mockResolvedValue({ downloadUrl: 'https://s3.pub/img.jpg' }),
  };

  const mockRedis = {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn(),
    invalidatePattern: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockS3.generateDownloadUrl.mockResolvedValue({ downloadUrl: 'https://s3.pub/img.jpg' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = moduleRef.get(PortfolioService);
  });

  describe('createProject', () => {
    it('throws ForbiddenException if user lacks professional role', async () => {
      await expect(
        service.createProject('u1', ['homeowner'], { title: 'Modern Villa' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if professional profile does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.createProject('u1', ['professional'], { title: 'Modern Villa' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ValidationException if specified localityId does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.locality.findUnique.mockResolvedValue(null);

      await expect(
        service.createProject('u1', ['professional'], {
          title: 'Modern Villa',
          localityId: 'invalid-loc',
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('creates project with unique slug and increments projectCount inside transaction', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.portfolioProject.findUnique.mockResolvedValue(null);

      const createdProj = {
        id: 'proj-1',
        title: 'Modern Villa',
        slug: 'modern-villa',
        professionalId: 'pp-1',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          portfolioProject: { create: jest.fn().mockResolvedValue(createdProj) },
          professionalProfile: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const res = await service.createProject('u1', ['professional'], {
        title: 'Modern Villa',
      });

      expect(res.slug).toBe('modern-villa');
      expect(mockRedis.invalidatePattern).toHaveBeenCalled();
    });

    it('handles slug collisions safely by appending numbers', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      // First slug check returns existing, second check returns null
      mockPrisma.portfolioProject.findUnique
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValueOnce(null);

      const createdProj = {
        id: 'proj-2',
        title: 'Modern Villa',
        slug: 'modern-villa-1',
        professionalId: 'pp-1',
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          portfolioProject: { create: jest.fn().mockResolvedValue(createdProj) },
          professionalProfile: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const res = await service.createProject('u1', ['professional'], {
        title: 'Modern Villa',
      });

      expect(res.slug).toBe('modern-villa-1');
    });
  });

  describe('deleteProject', () => {
    it('throws NotFoundException if project not found for professional', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.portfolioProject.findFirst.mockResolvedValue(null);

      await expect(service.deleteProject('u1', 'p-missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes project and decrements projectCount atomically when owned', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.portfolioProject.findFirst.mockResolvedValue({
        id: 'p-1',
        professionalId: 'pp-1',
      });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          portfolioProject: { delete: jest.fn().mockResolvedValue({}) },
          professionalProfile: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      await service.deleteProject('u1', 'p-1');
      expect(mockRedis.invalidatePattern).toHaveBeenCalled();
    });
  });
});
