import { Test } from '@nestjs/testing';
import { VerificationStatus } from '@prisma/client';
import { AdminVerificationService } from '../../src/modules/verification/admin-verification.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { S3Service } from '../../src/infrastructure/storage/s3.service';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { VerificationPolicyService } from '../../src/modules/verification/verification-policy.service';
import { VerificationLevelResolver } from '../../src/modules/verification/verification-level.resolver';
import { NotFoundException } from '../../src/common/errors/domain.exception';
import { StateConflictException } from '../../src/common/utils/conditional-update.util';

describe('AdminVerificationService', () => {
  let service: AdminVerificationService;

  const mockPrisma = {
    adminUser: {
      findUnique: jest.fn(),
    },
    verificationRecord: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    verificationDocument: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    verificationHistory: {
      create: jest.fn(),
    },
    professionalProfile: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockS3 = { generateDownloadUrl: jest.fn() };
  const mockRedis = { invalidatePattern: jest.fn() };
  const mockPolicy = { assertAllRequiredDocumentsVerified: jest.fn() };
  const mockLevelResolver = { resolveLevel: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: RedisService, useValue: mockRedis },
        { provide: VerificationPolicyService, useValue: mockPolicy },
        { provide: VerificationLevelResolver, useValue: mockLevelResolver },
      ],
    }).compile();
    service = moduleRef.get(AdminVerificationService);
  });

  describe('submitDecision', () => {
    it('throws NotFoundException if adminUser does not exist', async () => {
      mockPrisma.adminUser.findUnique.mockResolvedValue(null);
      await expect(
        service.submitDecision('admin-user-id', 'vr-1', {
          targetStatus: VerificationStatus.approved,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws StateConflictException if version mismatch occurs in transaction', async () => {
      mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'admin-1' });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          verificationRecord: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'vr-1',
              version: 2, // version mismatch! expected 1
              status: VerificationStatus.pending,
              professional: { categoryMap: [] },
              documents: [],
            }),
          },
        };
        return fn(tx);
      });

      await expect(
        service.submitDecision('admin-user-id', 'vr-1', {
          targetStatus: VerificationStatus.approved,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(StateConflictException);
    });
  });
});
