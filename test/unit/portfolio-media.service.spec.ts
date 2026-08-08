import { Test } from '@nestjs/testing';
import { PortfolioMediaService } from '../../src/modules/portfolio/portfolio-media.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { S3Service } from '../../src/infrastructure/storage/s3.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { ValidationException } from '../../src/common/errors/domain.exception';

describe('PortfolioMediaService', () => {
  let service: PortfolioMediaService;

  const mockPrisma = {
    professionalProfile: {
      findUnique: jest.fn(),
    },
    portfolioProject: {
      findFirst: jest.fn(),
    },
    portfolioMedia: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockS3 = {
    generateUploadUrl: jest.fn(),
  };

  const mockRedis = {
    invalidatePattern: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioMediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = moduleRef.get(PortfolioMediaService);
  });

  describe('getPresignedUploadUrl', () => {
    it('throws ValidationException for invalid MIME type (e.g. PDF/video)', async () => {
      await expect(
        service.getPresignedUploadUrl('u1', 'p1', {
          originalFilename: 'doc.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException if file size exceeds 10 MB', async () => {
      await expect(
        service.getPresignedUploadUrl('u1', 'p1', {
          originalFilename: 'large.png',
          mimeType: 'image/png',
          fileSize: 15 * 1024 * 1024, // 15 MB > 10 MB
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('generates upload URL for public S3 bucket when valid', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.portfolioProject.findFirst.mockResolvedValue({
        id: 'proj-1',
        professionalId: 'pp-1',
      });
      mockS3.generateUploadUrl.mockResolvedValue({
        uploadUrl: 'https://s3.pub/upload',
        objectKey: 'portfolio-media/pp-1/proj-1/uuid',
        expiresAt: new Date(),
      });

      const res = await service.getPresignedUploadUrl('u1', 'proj-1', {
        originalFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2 * 1024 * 1024,
      });

      expect(res.uploadUrl).toBe('https://s3.pub/upload');
      expect(mockS3.generateUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'public' }),
      );
    });
  });

  describe('attachMedia', () => {
    it('unsets existing cover image when attaching media with isCover = true', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.portfolioProject.findFirst.mockResolvedValue({
        id: 'proj-1',
        professionalId: 'pp-1',
      });

      const createdMedia = {
        id: 'm-2',
        portfolioProjectId: 'proj-1',
        fileKey: 'key/m2.jpg',
        isCover: true,
      };

      const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const mockCreate = jest.fn().mockResolvedValue(createdMedia);

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          portfolioMedia: {
            updateMany: mockUpdateMany,
            create: mockCreate,
          },
        };
        return fn(tx);
      });

      const res = await service.attachMedia('u1', 'proj-1', {
        fileKey: 'key/m2.jpg',
        originalFilename: 'm2.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        isCover: true,
      });

      expect(res.isCover).toBe(true);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { portfolioProjectId: 'proj-1', isCover: true },
        data: { isCover: false },
      });
    });
  });
});
