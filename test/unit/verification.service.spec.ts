import { Test } from '@nestjs/testing';
import { VerificationStatus } from '@prisma/client';
import { VerificationService } from '../../src/modules/verification/verification.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { S3Service } from '../../src/infrastructure/storage/s3.service';
import { VerificationPolicyService } from '../../src/modules/verification/verification-policy.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../src/common/errors/domain.exception';

describe('VerificationService', () => {
  let service: VerificationService;

  const mockPrisma = {
    professionalProfile: {
      findUnique: jest.fn(),
    },
    verificationRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    verificationHistory: {
      create: jest.fn(),
    },
    verificationDocument: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockS3 = {
    generateUploadUrl: jest.fn(),
  };

  const mockPolicy = {
    assertAllRequiredDocumentsPresent: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: VerificationPolicyService, useValue: mockPolicy },
      ],
    }).compile();
    service = moduleRef.get(VerificationService);
  });

  describe('createApplication', () => {
    it('throws ForbiddenException if user lacks professional role', async () => {
      await expect(service.createApplication('u1', ['homeowner'])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException if professional profile not found', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.createApplication('u1', ['professional']),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if active application exists', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.verificationRecord.findFirst.mockResolvedValue({ id: 'vr-active' });
      await expect(
        service.createApplication('u1', ['professional']),
      ).rejects.toThrow(ConflictException);
    });

    it('creates draft application inside transaction when valid', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'pp-1' });
      mockPrisma.verificationRecord.findFirst.mockResolvedValue(null);

      const createdRecord = {
        id: 'vr-1',
        professionalId: 'pp-1',
        status: VerificationStatus.draft,
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          verificationRecord: { create: jest.fn().mockResolvedValue(createdRecord) },
          verificationHistory: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const res = await service.createApplication('u1', ['professional']);
      expect(res.id).toBe('vr-1');
    });
  });
});
