import { Test } from '@nestjs/testing';
import { CoverageType, VerificationLevel } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ProfessionalProfilesService } from '../../src/modules/profiles/professional-profiles.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../src/common/errors/domain.exception';
import { CoverageTypeDto } from '../../src/modules/profiles/dto/create-service-area.dto';

describe('ProfessionalProfilesService', () => {
  let service: ProfessionalProfilesService;

  const mockPrisma = {
    professionalProfile: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    serviceArea: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    professionalCategory: {
      findMany: jest.fn(),
    },
    professionalCategoryMap: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    locality: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockRedis = {
    invalidatePattern: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfessionalProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    service = moduleRef.get(ProfessionalProfilesService);
  });

  const profileRow = {
    id: 'pp-1',
    slug: 'test-biz',
    businessName: 'Test Biz',
    bio: null,
    yearsExperience: null,
    primaryLocalityId: 'loc-1',
    verificationLevel: VerificationLevel.unverified,
    verifiedAt: null,
    isPublished: false,
    averageRating: new Decimal('0.00'),
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('throws ForbiddenException when user lacks professional role', async () => {
      await expect(
        service.create('u1', ['homeowner'], {
          businessName: 'Biz',
          primaryLocalityId: 'loc-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when primaryLocalityId does not exist', async () => {
      mockPrisma.locality.findUnique.mockResolvedValue(null);
      await expect(
        service.create('u1', ['professional'], {
          businessName: 'Biz',
          primaryLocalityId: 'bad-loc',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when profile already exists', async () => {
      mockPrisma.locality.findUnique.mockResolvedValue({ id: 'loc-1' });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      await expect(
        service.create('u1', ['professional'], {
          businessName: 'Biz',
          primaryLocalityId: 'loc-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates profile with generated slug and returns response', async () => {
      mockPrisma.locality.findUnique.mockResolvedValue({ id: 'loc-1' });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      mockPrisma.professionalProfile.create.mockResolvedValue(profileRow);

      const result = await service.create('u1', ['professional'], {
        businessName: 'Test Biz',
        primaryLocalityId: 'loc-1',
      });

      expect(result.id).toBe('pp-1');
      expect(result.businessName).toBe('Test Biz');
      // averageRating serialised as string
      expect(result.averageRating).toBe('0.00');
      const createCall = mockPrisma.professionalProfile.create.mock.calls[0][0];
      expect(createCall.data.slug).toBe('test-biz');
    });

    it('slug is generated from businessName and stored', async () => {
      mockPrisma.locality.findUnique.mockResolvedValue({ id: 'loc-1' });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      mockPrisma.professionalProfile.create.mockResolvedValue(profileRow);

      await service.create('u1', ['professional'], {
        businessName: 'Sharma Interiors & Décor',
        primaryLocalityId: 'loc-1',
      });

      const createCall = mockPrisma.professionalProfile.create.mock.calls[0][0];
      expect(createCall.data.slug).toBe('sharma-interiors-decor');
    });
  });

  describe('getMe', () => {
    it('throws NotFoundException when no profile exists', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      await expect(service.getMe('u1')).rejects.toThrow(NotFoundException);
    });

    it('returns the profile when found', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(profileRow);
      const result = await service.getMe('u1');
      expect(result.id).toBe('pp-1');
    });
  });

  describe('updateMe', () => {
    it('throws NotFoundException when profile does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMe('u1', { businessName: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when new primaryLocalityId does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.locality.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMe('u1', { primaryLocalityId: 'bad' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('invalidates cache after update', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.locality.findUnique.mockResolvedValue({ id: 'loc-2' });
      mockPrisma.professionalProfile.update.mockResolvedValue(profileRow);
      mockRedis.invalidatePattern.mockResolvedValue(undefined);

      await service.updateMe('u1', { primaryLocalityId: 'loc-2' });

      expect(mockRedis.invalidatePattern).toHaveBeenCalledWith(
        expect.anything(),
        'professional:pp-1:*',
      );
    });
  });

  describe('createServiceArea', () => {
    it('throws NotFoundException when profile does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.createServiceArea('u1', {
          localityId: 'loc-1',
          coverageType: CoverageTypeDto.LOCALITY,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ValidationException when radiusKm provided for locality coverage', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      await expect(
        service.createServiceArea('u1', {
          localityId: 'loc-1',
          coverageType: CoverageTypeDto.LOCALITY,
          radiusKm: 10,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException when radiusKm missing for radius coverage', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      await expect(
        service.createServiceArea('u1', {
          localityId: 'loc-1',
          coverageType: CoverageTypeDto.RADIUS,
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('creates locality-type service area and invalidates cache', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.locality.findUnique.mockResolvedValue({ id: 'loc-1' });
      const areaRow = {
        id: 'sa-1',
        localityId: 'loc-1',
        coverageType: CoverageType.locality,
        radiusKm: null,
        createdAt: new Date(),
      };
      mockPrisma.serviceArea.create.mockResolvedValue(areaRow);
      mockRedis.invalidatePattern.mockResolvedValue(undefined);

      const result = await service.createServiceArea('u1', {
        localityId: 'loc-1',
        coverageType: CoverageTypeDto.LOCALITY,
      });

      expect(result.id).toBe('sa-1');
      expect(result.radiusKm).toBeNull();
      expect(mockRedis.invalidatePattern).toHaveBeenCalled();
    });
  });

  describe('deleteServiceArea', () => {
    it('throws NotFoundException when profile does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.deleteServiceArea('u1', 'sa-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when service area not found for this profile', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.serviceArea.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteServiceArea('u1', 'sa-bad'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes and invalidates cache', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.serviceArea.findFirst.mockResolvedValue({ id: 'sa-1' });
      mockPrisma.serviceArea.delete.mockResolvedValue({});
      mockRedis.invalidatePattern.mockResolvedValue(undefined);

      await service.deleteServiceArea('u1', 'sa-1');

      expect(mockPrisma.serviceArea.delete).toHaveBeenCalledWith({
        where: { id: 'sa-1' },
      });
      expect(mockRedis.invalidatePattern).toHaveBeenCalled();
    });
  });

  describe('replaceCategories', () => {
    it('throws NotFoundException when profile does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.replaceCategories('u1', { categoryIds: ['cat-1'] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ValidationException for duplicate categoryIds', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      await expect(
        service.replaceCategories('u1', {
          categoryIds: ['cat-1', 'cat-1'],
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException when a categoryId does not exist', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.professionalCategory.findMany.mockResolvedValue([]);
      await expect(
        service.replaceCategories('u1', { categoryIds: ['bad-cat'] }),
      ).rejects.toThrow(ValidationException);
    });

    it('performs full-replace in transaction and invalidates cache', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.professionalCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
        { id: 'cat-2' },
      ]);

      const txResult = [
        { id: 'cm-1', categoryId: 'cat-1', createdAt: new Date() },
        { id: 'cm-2', categoryId: 'cat-2', createdAt: new Date() },
      ];

      // The service calls $transaction with a callback; simulate by invoking the
      // callback with a tx object that has the required Prisma methods.
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            professionalCategoryMap: {
              findMany: jest
                .fn()
                // First call: fetch existing rows (empty)
                .mockResolvedValueOnce([])
                // Second call: fetch final result after upsert
                .mockResolvedValueOnce(txResult),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
          };
          return fn(tx);
        },
      );

      mockRedis.invalidatePattern.mockResolvedValue(undefined);

      const result = await service.replaceCategories('u1', {
        categoryIds: ['cat-1', 'cat-2'],
      });

      expect(result).toHaveLength(2);
      expect(mockRedis.invalidatePattern).toHaveBeenCalled();
    });
  });
});
