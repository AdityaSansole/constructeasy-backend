import { Test } from '@nestjs/testing';
import { HomeownerProfilesService } from '../../src/modules/profiles/homeowner-profiles.service';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../src/common/errors/domain.exception';

describe('HomeownerProfilesService', () => {
  let service: HomeownerProfilesService;

  const mockPrisma = {
    homeownerProfile: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    locality: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HomeownerProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = moduleRef.get(HomeownerProfilesService);
  });

  const profileRow = {
    id: 'hp-1',
    fullName: 'Test User',
    localityId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('throws ForbiddenException when user lacks homeowner role', async () => {
      await expect(
        service.create('u1', ['professional'], { fullName: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when localityId does not exist', async () => {
      mockPrisma.locality.findUnique.mockResolvedValue(null);
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.create('u1', ['homeowner'], {
          fullName: 'Test',
          localityId: 'loc-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when profile already exists', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'hp-1' });
      await expect(
        service.create('u1', ['homeowner'], { fullName: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates and returns a homeowner profile', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue(null);
      mockPrisma.homeownerProfile.create.mockResolvedValue(profileRow);
      const result = await service.create('u1', ['homeowner'], {
        fullName: 'Test User',
      });
      expect(result.id).toBe('hp-1');
      expect(result.fullName).toBe('Test User');
      expect(mockPrisma.homeownerProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', fullName: 'Test User' }),
        }),
      );
    });
  });

  describe('getMe', () => {
    it('throws NotFoundException when no profile exists', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue(null);
      await expect(service.getMe('u1')).rejects.toThrow(NotFoundException);
    });

    it('returns the profile when found', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue(profileRow);
      const result = await service.getMe('u1');
      expect(result.id).toBe('hp-1');
    });
  });

  describe('updateMe', () => {
    it('throws NotFoundException when profile does not exist', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMe('u1', { fullName: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when new localityId does not exist', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'hp-1' });
      mockPrisma.locality.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMe('u1', { localityId: 'bad-loc' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears localityId when null is passed', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'hp-1' });
      mockPrisma.homeownerProfile.update.mockResolvedValue(profileRow);
      await service.updateMe('u1', { localityId: null });
      expect(mockPrisma.homeownerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            locality: { disconnect: true },
          }),
        }),
      );
    });

    it('updates only provided fields', async () => {
      mockPrisma.homeownerProfile.findUnique.mockResolvedValue({ id: 'hp-1' });
      mockPrisma.homeownerProfile.update.mockResolvedValue({
        ...profileRow,
        fullName: 'Updated',
      });
      const result = await service.updateMe('u1', { fullName: 'Updated' });
      expect(result.fullName).toBe('Updated');
    });
  });
});
