import { Test } from '@nestjs/testing';
import { ContactsService } from '../../src/modules/contacts/contacts.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ContactStatus, VerificationLevel, Prisma } from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../src/common/errors/domain.exception';
import { StateConflictException } from '../../src/common/utils/conditional-update.util';

describe('ContactsService', () => {
  let service: ContactsService;

  const mockPrisma = {
    homeownerProfile: {
      findUnique: jest.fn(),
    },
    professionalProfile: {
      findUnique: jest.fn(),
    },
    portfolioProject: {
      findUnique: jest.fn(),
    },
    contact: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    contactHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = moduleRef.get(ContactsService);
  });

  describe('createContact', () => {
    it('throws ForbiddenException if user lacks an active Homeowner profile', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.createContact('u-1', ['homeowner'], {
          professionalId: 'p-1',
          message: 'Hello',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ValidationException if target professional is unverified', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({
        id: 'p-1',
        isPublished: true,
        deletedAt: null,
        verificationLevel: VerificationLevel.unverified,
      });

      await expect(
        service.createContact('u-1', ['homeowner'], {
          professionalId: 'p-1',
          message: 'Hello',
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ValidationException if specified project does not belong to target professional', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({
        id: 'p-1',
        isPublished: true,
        deletedAt: null,
        verificationLevel: VerificationLevel.level_1,
      });
      mockPrisma.portfolioProject.findUnique.mockResolvedValue({
        id: 'proj-1',
        professionalId: 'other-prof',
      });

      await expect(
        service.createContact('u-1', ['homeowner'], {
          professionalId: 'p-1',
          projectId: 'proj-1',
          message: 'Hello',
        }),
      ).rejects.toThrow(ValidationException);
    });

    it('throws ConflictException (409) if an active pending lead already exists', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({
        id: 'p-1',
        isPublished: true,
        deletedAt: null,
        verificationLevel: VerificationLevel.level_2,
      });
      mockPrisma.contact.findFirst.mockResolvedValue({ id: 'c-existing', status: ContactStatus.pending });

      await expect(
        service.createContact('u-1', ['homeowner'], {
          professionalId: 'p-1',
          message: 'Hello',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('catches PostgreSQL P2002 unique constraint error and returns controlled ConflictException (409)', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({
        id: 'p-1',
        isPublished: true,
        deletedAt: null,
        verificationLevel: VerificationLevel.level_2,
      });
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
      mockPrisma.$transaction.mockRejectedValue(p2002Error);

      await expect(
        service.createContact('u-1', ['homeowner'], {
          professionalId: 'p-1',
          message: 'Hello',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('acceptContact / cancelContact / archiveContact state transitions', () => {
    it('accepts pending contact atomically inside transaction', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'prof-1' });
      mockPrisma.contact.findFirst.mockResolvedValue({
        id: 'c-1',
        professionalId: 'prof-1',
        status: ContactStatus.pending,
      });

      const updatedContact = { id: 'c-1', status: ContactStatus.accepted };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          contact: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue(updatedContact),
          },
          contactHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const res = await service.acceptContact('u-prof', 'c-1');
      expect(res?.status).toBe(ContactStatus.accepted);
    });

    it('throws StateConflictException if contact status is no longer pending when accepting', async () => {
      mockPrisma.professionalProfile.findUnique.mockResolvedValue({ id: 'prof-1' });
      mockPrisma.contact.findFirst.mockResolvedValue({
        id: 'c-1',
        professionalId: 'prof-1',
        status: ContactStatus.canceled,
      });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          contact: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return fn(tx);
      });

      await expect(service.acceptContact('u-prof', 'c-1')).rejects.toThrow(
        StateConflictException,
      );
    });

    it('throws StateConflictException if attempting to archive a pending contact', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: 'c-1',
        status: ContactStatus.pending,
        homeowner: { userId: 'u-1' },
        professional: { userId: 'u-2' },
      });

      await expect(service.archiveContact('u-1', 'c-1')).rejects.toThrow(
        StateConflictException,
      );
    });
  });

  describe('IDOR & PII Protection', () => {
    it('throws NotFoundException (404) if third party attempts to view contact detail', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: 'c-1',
        homeowner: { userId: 'owner-user' },
        professional: { userId: 'prof-user' },
      });

      await expect(service.getContactDetail('intruder-user', 'c-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
