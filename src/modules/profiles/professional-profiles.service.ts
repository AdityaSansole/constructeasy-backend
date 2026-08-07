import { Injectable } from '@nestjs/common';
import { Prisma, VerificationLevel, CoverageType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService, RedisNamespace } from '../../infrastructure/redis/redis.service';
import { slugify, buildIdSlug } from '../../common/utils/slug.util';
import { CreateProfessionalProfileDto } from './dto/create-professional-profile.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { CreateServiceAreaDto, CoverageTypeDto } from './dto/create-service-area.dto';
import { ReplaceCategoriesDto } from './dto/replace-categories.dto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../common/errors/domain.exception';

export interface ProfessionalProfileResponse {
  id: string;
  slug: string;
  businessName: string;
  bio: string | null;
  yearsExperience: number | null;
  primaryLocalityId: string;
  verificationLevel: VerificationLevel;
  verifiedAt: Date | null;
  isPublished: boolean;
  averageRating: string;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceAreaResponse {
  id: string;
  localityId: string;
  coverageType: CoverageType;
  radiusKm: string | null;
  createdAt: Date;
}

export interface CategoryMapResponse {
  id: string;
  categoryId: string;
  createdAt: Date;
}

/**
 * ProfessionalProfilesService — spec Sections 3, 7, 9, 10, 11, 14.
 * Every mutating endpoint calls invalidateProfessionalCache per Section 14.
 * Slug is generated once at creation via slug.util.ts and is immutable.
 */
@Injectable()
export class ProfessionalProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ---------------------------------------------------------------------------
  // Profile CRUD
  // ---------------------------------------------------------------------------

  async create(
    userId: string,
    roles: string[],
    dto: CreateProfessionalProfileDto,
  ): Promise<ProfessionalProfileResponse> {
    if (!roles.includes('professional')) {
      throw new ForbiddenException(
        'Only users with the professional role may create a professional profile.',
      );
    }

    await this.assertLocalityExists(dto.primaryLocalityId);

    // Application-level existence check — clean 409 before DB constraint fires.
    const existing = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A professional profile already exists for this account.',
      );
    }

    // Slug is generated once at creation and is immutable thereafter (spec Section 3).
    const slug = slugify(dto.businessName);

    try {
      const profile = await this.prisma.professionalProfile.create({
        data: {
          userId,
          businessName: dto.businessName,
          slug,
          bio: dto.bio ?? null,
          yearsExperience: dto.yearsExperience ?? null,
          primaryLocalityId: dto.primaryLocalityId,
        },
        select: this.profileSelectFields(),
      });
      return this.toProfileResponse(profile);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A professional profile already exists for this account.',
        );
      }
      throw err;
    }
  }

  async getMe(userId: string): Promise<ProfessionalProfileResponse> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: this.profileSelectFields(),
    });
    if (!profile) {
      throw new NotFoundException('ProfessionalProfile');
    }
    return this.toProfileResponse(profile);
  }

  async updateMe(
    userId: string,
    dto: UpdateProfessionalProfileDto,
  ): Promise<ProfessionalProfileResponse> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('ProfessionalProfile');
    }

    if (dto.primaryLocalityId !== undefined) {
      await this.assertLocalityExists(dto.primaryLocalityId);
    }

    const data: Prisma.ProfessionalProfileUpdateInput = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.yearsExperience !== undefined)
      data.yearsExperience = dto.yearsExperience;
    if (dto.bio !== undefined) data.bio = dto.bio ?? null;
    if (dto.primaryLocalityId !== undefined) {
      data.primaryLocality = { connect: { id: dto.primaryLocalityId } };
    }

    const updated = await this.prisma.professionalProfile.update({
      where: { userId },
      data,
      select: this.profileSelectFields(),
    });

    await this.invalidateProfessionalCache(profile.id);
    return this.toProfileResponse(updated);
  }

  // ---------------------------------------------------------------------------
  // Service Areas
  // ---------------------------------------------------------------------------

  async createServiceArea(
    userId: string,
    dto: CreateServiceAreaDto,
  ): Promise<ServiceAreaResponse> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('ProfessionalProfile');
    }

    // Cross-field validation: radiusKm must be absent for locality coverage
    if (
      dto.coverageType === CoverageTypeDto.LOCALITY &&
      dto.radiusKm !== undefined
    ) {
      throw new ValidationException(
        'radiusKm must not be provided when coverageType is locality.',
      );
    }
    if (
      dto.coverageType === CoverageTypeDto.RADIUS &&
      (dto.radiusKm === undefined || dto.radiusKm === null)
    ) {
      throw new ValidationException(
        'radiusKm is required and must be greater than 0 when coverageType is radius.',
      );
    }

    await this.assertLocalityExists(dto.localityId);

    try {
      const area = await this.prisma.serviceArea.create({
        data: {
          professionalId: profile.id,
          localityId: dto.localityId,
          coverageType: dto.coverageType as unknown as CoverageType,
          radiusKm:
            dto.radiusKm !== undefined ? new Decimal(dto.radiusKm) : null,
        },
        select: this.serviceAreaSelectFields(),
      });

      await this.invalidateProfessionalCache(profile.id);
      return this.toServiceAreaResponse(area);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A service area for this locality already exists on this profile.',
        );
      }
      throw err;
    }
  }

  async listServiceAreas(userId: string): Promise<ServiceAreaResponse[]> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('ProfessionalProfile');
    }

    const areas = await this.prisma.serviceArea.findMany({
      where: { professionalId: profile.id },
      select: this.serviceAreaSelectFields(),
      orderBy: { createdAt: 'asc' },
    });
    return areas.map((a) => this.toServiceAreaResponse(a));
  }

  async deleteServiceArea(userId: string, areaId: string): Promise<void> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('ProfessionalProfile');
    }

    // Scope delete to caller's own profile — cross-tenant access structurally impossible.
    const area = await this.prisma.serviceArea.findFirst({
      where: { id: areaId, professionalId: profile.id },
      select: { id: true },
    });
    if (!area) {
      throw new NotFoundException('ServiceArea');
    }

    await this.prisma.serviceArea.delete({ where: { id: areaId } });
    await this.invalidateProfessionalCache(profile.id);
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async replaceCategories(
    userId: string,
    dto: ReplaceCategoriesDto,
  ): Promise<CategoryMapResponse[]> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('ProfessionalProfile');
    }

    // Duplicate check in request body
    const unique = new Set(dto.categoryIds);
    if (unique.size !== dto.categoryIds.length) {
      throw new ValidationException('categoryIds must not contain duplicates.');
    }

    // Validate all category ids exist before touching the DB
    const categories = await this.prisma.professionalCategory.findMany({
      where: { id: { in: dto.categoryIds } },
      select: { id: true },
    });
    if (categories.length !== dto.categoryIds.length) {
      throw new ValidationException(
        'One or more categoryIds do not reference a valid professional category.',
      );
    }

    // Full-replace in a transaction: delete removed, insert added, leave unchanged untouched.
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.professionalCategoryMap.findMany({
        where: { professionalId: profile.id },
        select: { id: true, categoryId: true },
      });

      const existingIds = new Set(existing.map((e) => e.categoryId));
      const desiredIds = new Set(dto.categoryIds);

      const toDelete = existing
        .filter((e) => !desiredIds.has(e.categoryId))
        .map((e) => e.id);

      const toAdd = dto.categoryIds.filter((id) => !existingIds.has(id));

      if (toDelete.length > 0) {
        await tx.professionalCategoryMap.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      if (toAdd.length > 0) {
        await tx.professionalCategoryMap.createMany({
          data: toAdd.map((categoryId) => ({
            professionalId: profile.id,
            categoryId,
          })),
        });
      }

      return tx.professionalCategoryMap.findMany({
        where: { professionalId: profile.id },
        select: { id: true, categoryId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    await this.invalidateProfessionalCache(profile.id);
    return result.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      createdAt: r.createdAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------

  /**
   * Invalidates the professional's cache entries per spec Section 14.
   * Uses the existing RedisService.invalidatePattern from Batch 0 infrastructure.
   */
  private async invalidateProfessionalCache(profileId: string): Promise<void> {
    await this.redis.invalidatePattern(
      RedisNamespace.Cache,
      `professional:${profileId}:*`,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertLocalityExists(localityId: string): Promise<void> {
    const locality = await this.prisma.locality.findUnique({
      where: { id: localityId },
      select: { id: true },
    });
    if (!locality) {
      throw new NotFoundException('Locality');
    }
  }

  private profileSelectFields() {
    return {
      id: true,
      slug: true,
      businessName: true,
      bio: true,
      yearsExperience: true,
      primaryLocalityId: true,
      verificationLevel: true,
      verifiedAt: true,
      isPublished: true,
      averageRating: true,
      reviewCount: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private serviceAreaSelectFields() {
    return {
      id: true,
      localityId: true,
      coverageType: true,
      radiusKm: true,
      createdAt: true,
    } as const;
  }

  private toProfileResponse(profile: {
    id: string;
    slug: string;
    businessName: string;
    bio: string | null;
    yearsExperience: number | null;
    primaryLocalityId: string;
    verificationLevel: VerificationLevel;
    verifiedAt: Date | null;
    isPublished: boolean;
    averageRating: Decimal;
    reviewCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): ProfessionalProfileResponse {
    return {
      id: profile.id,
      slug: buildIdSlug(profile.id, profile.slug),
      businessName: profile.businessName,
      bio: profile.bio,
      yearsExperience: profile.yearsExperience,
      primaryLocalityId: profile.primaryLocalityId,
      verificationLevel: profile.verificationLevel,
      verifiedAt: profile.verifiedAt,
      isPublished: profile.isPublished,
      averageRating: profile.averageRating.toFixed(2),
      reviewCount: profile.reviewCount,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private toServiceAreaResponse(area: {
    id: string;
    localityId: string;
    coverageType: CoverageType;
    radiusKm: Decimal | null;
    createdAt: Date;
  }): ServiceAreaResponse {
    return {
      id: area.id,
      localityId: area.localityId,
      coverageType: area.coverageType,
      radiusKm: area.radiusKm !== null ? area.radiusKm.toFixed(2) : null,
      createdAt: area.createdAt,
    };
  }
}
