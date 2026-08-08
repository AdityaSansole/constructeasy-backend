import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import {
  RedisNamespace,
  RedisService,
} from '../../infrastructure/redis/redis.service';
import {
  buildPaginatedResult,
  Paginated,
  toPrismaPagination,
} from '../../common/dto/pagination.dto';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { SearchProjectsDto } from './dto/search-projects.dto';
import { CompareProfessionalsDto } from './dto/compare-professionals.dto';
import {
  PublicProfessionalResponseDto,
} from './dto/public-professional-response.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../common/errors/domain.exception';
import { Prisma } from '@prisma/client';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly redis: RedisService,
  ) {}

  /**
   * Helper to build SHA-256 hash string for Redis cache keys.
   */
  private buildCacheKey(prefix: string, params: object): string {
    const jsonStr = JSON.stringify(params, Object.keys(params).sort());
    const hash = createHash('sha256').update(jsonStr).digest('hex');
    return `${prefix}:${hash}`;
  }

  /**
   * Maps Prisma ProfessionalProfile record to whitelisted PublicProfessionalResponseDto.
   */
  private async mapToPublicDto(prof: any): Promise<PublicProfessionalResponseDto> {
    // Resolve cover image from portfolio projects if present
    let coverImage: { url: string; caption?: string | null } | null = null;
    let featuredProjects: any[] = [];

    if (prof.portfolioProjects && prof.portfolioProjects.length > 0) {
      // Find explicit cover image among project media
      for (const proj of prof.portfolioProjects) {
        if (proj.media && proj.media.length > 0) {
          const coverMedia = proj.media.find((m: any) => m.isCover) || proj.media[0];
          if (coverMedia && !coverImage) {
            const { downloadUrl } = await this.s3.generateDownloadUrl({
              bucket: 'public',
              objectKey: coverMedia.fileKey,
            });
            coverImage = { url: downloadUrl, caption: coverMedia.caption };
          }
        }
      }

      // Map top featured projects
      featuredProjects = await Promise.all(
        prof.portfolioProjects
          .filter((p: any) => p.isPublished)
          .slice(0, 3)
          .map(async (p: any) => {
            let projCoverUrl: string | null = null;
            if (p.media && p.media.length > 0) {
              const m = p.media.find((med: any) => med.isCover) || p.media[0];
              if (m) {
                const { downloadUrl } = await this.s3.generateDownloadUrl({
                  bucket: 'public',
                  objectKey: m.fileKey,
                });
                projCoverUrl = downloadUrl;
              }
            }
            return {
              id: p.id,
              title: p.title,
              slug: p.slug,
              projectType: p.projectType,
              completionYear: p.completionYear,
              costInr: p.costInr ? Number(p.costInr) : null,
              coverImageUrl: projCoverUrl,
            };
          }),
      );
    }

    return {
      id: prof.id,
      businessName: prof.businessName,
      slug: prof.slug,
      bio: prof.bio,
      yearsExperience: prof.yearsExperience,
      verificationLevel: prof.verificationLevel,
      verifiedAt: prof.verifiedAt,
      averageRating: Number(prof.averageRating ?? 0),
      reviewCount: prof.reviewCount ?? 0,
      projectCount: prof.projectCount ?? 0,
      primaryLocation: prof.primaryLocality
        ? {
            localityId: prof.primaryLocality.id,
            localityName: prof.primaryLocality.name,
            cityId: prof.primaryLocality.city.id,
            cityName: prof.primaryLocality.city.name,
            citySlug: prof.primaryLocality.city.slug,
            stateName: prof.primaryLocality.city.state.name,
          }
        : undefined,
      categories:
        prof.categoryMap?.map((cm: any) => ({
          id: cm.category.id,
          name: cm.category.name,
          slug: cm.category.slug,
        })) ?? [],
      serviceAreas:
        prof.serviceAreas?.map((sa: any) => ({
          localityId: sa.locality.id,
          localityName: sa.locality.name,
          cityName: sa.locality.city.name,
        })) ?? [],
      coverImage,
      featuredProjects,
      createdAt: prof.createdAt,
    };
  }

  /**
   * Search professionals with multi-criteria filters, trust ranking, and Redis caching.
   */
  async searchProfessionals(
    dto: SearchProfessionalsDto,
  ): Promise<Paginated<PublicProfessionalResponseDto>> {
    const cacheKey = this.buildCacheKey('search:prof', dto);
    const cached = await this.redis.get<Paginated<PublicProfessionalResponseDto>>(
      RedisNamespace.Cache,
      cacheKey,
    );
    if (cached) {
      return cached;
    }

    const where: Prisma.ProfessionalProfileWhereInput = {
      isPublished: true,
      deletedAt: null,
    };

    if (dto.q) {
      where.OR = [
        { businessName: { contains: dto.q, mode: 'insensitive' } },
        { bio: { contains: dto.q, mode: 'insensitive' } },
      ];
    }

    if (dto.category) {
      where.categoryMap = {
        some: { category: { slug: dto.category } },
      };
    }

    if (dto.localityId) {
      where.OR = [
        ...(where.OR || []),
        { primaryLocalityId: dto.localityId },
        { serviceAreas: { some: { localityId: dto.localityId } } },
      ];
    }

    if (dto.city) {
      where.OR = [
        ...(where.OR || []),
        { primaryLocality: { city: { slug: dto.city } } },
        { serviceAreas: { some: { locality: { city: { slug: dto.city } } } } },
      ];
    }

    if (dto.verificationLevel) {
      where.verificationLevel = dto.verificationLevel;
    }

    if (dto.minRating !== undefined) {
      where.averageRating = { gte: dto.minRating };
    }

    if (dto.minProjects !== undefined) {
      where.projectCount = { gte: dto.minProjects };
    }

    // Determine ordering strategy
    const orderBy: Prisma.ProfessionalProfileOrderByWithRelationInput[] = [];

    if (dto.sort === 'rating') {
      orderBy.push({ averageRating: 'desc' }, { reviewCount: 'desc' }, { createdAt: 'desc' });
    } else if (dto.sort === 'projects') {
      orderBy.push({ projectCount: 'desc' }, { averageRating: 'desc' }, { createdAt: 'desc' });
    } else if (dto.sort === 'newest') {
      orderBy.push({ createdAt: 'desc' });
    } else {
      // Default: Trust ranking
      // Prisma handles VerificationLevel enum ordering; to ensure deterministic level_2 > level_1 > unverified:
      orderBy.push(
        { verificationLevel: 'desc' },
        { averageRating: 'desc' },
        { reviewCount: 'desc' },
        { projectCount: 'desc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      );
    }

    const { skip, take } = toPrismaPagination(dto);

    const [totalCount, rows] = await Promise.all([
      this.prisma.professionalProfile.count({ where }),
      this.prisma.professionalProfile.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          primaryLocality: { include: { city: { include: { state: true } } } },
          categoryMap: { include: { category: true } },
          serviceAreas: { include: { locality: { include: { city: true } } } },
          portfolioProjects: {
            where: { isPublished: true },
            orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }],
            include: { media: { orderBy: { displayOrder: 'asc' } } },
          },
        },
      }),
    ]);

    const mappedItems = await Promise.all(rows.map((r) => this.mapToPublicDto(r)));
    const result = buildPaginatedResult(mappedItems, totalCount, dto);

    await this.redis.set(RedisNamespace.Cache, cacheKey, result, 300); // 300s TTL
    return result;
  }

  /**
   * Search portfolio projects across published professionals.
   */
  async searchProjects(dto: SearchProjectsDto): Promise<Paginated<any>> {
    const cacheKey = this.buildCacheKey('search:proj', dto);
    const cached = await this.redis.get<Paginated<any>>(
      RedisNamespace.Cache,
      cacheKey,
    );
    if (cached) {
      return cached;
    }

    const profFilter: Prisma.ProfessionalProfileWhereInput = {
      isPublished: true,
      deletedAt: null,
    };

    if (dto.category) {
      profFilter.categoryMap = { some: { category: { slug: dto.category } } };
    }

    const where: Prisma.PortfolioProjectWhereInput = {
      isPublished: true,
      professional: profFilter,
    };

    if (dto.q) {
      where.OR = [
        { title: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }

    if (dto.projectType) {
      where.projectType = { contains: dto.projectType, mode: 'insensitive' };
    }

    if (dto.completionYear) {
      where.completionYear = dto.completionYear;
    }

    if (dto.minCost !== undefined || dto.maxCost !== undefined) {
      where.costInr = {};
      if (dto.minCost !== undefined) where.costInr.gte = dto.minCost;
      if (dto.maxCost !== undefined) where.costInr.lte = dto.maxCost;
    }

    if (dto.localityId) {
      where.localityId = dto.localityId;
    }

    const { skip, take } = toPrismaPagination(dto);

    const [totalCount, projects] = await Promise.all([
      this.prisma.portfolioProject.count({ where }),
      this.prisma.portfolioProject.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: {
          locality: true,
          media: { orderBy: { displayOrder: 'asc' } },
          professional: {
            select: {
              id: true,
              businessName: true,
              slug: true,
              verificationLevel: true,
            },
          },
        },
      }),
    ]);

    const mappedProjects = await Promise.all(
      projects.map(async (p) => ({
        ...p,
        costInr: p.costInr ? Number(p.costInr) : null,
        media: await Promise.all(
          p.media.map(async (m) => {
            const { downloadUrl } = await this.s3.generateDownloadUrl({
              bucket: 'public',
              objectKey: m.fileKey,
            });
            return { ...m, downloadUrl };
          }),
        ),
      })),
    );

    const result = buildPaginatedResult(mappedProjects, totalCount, dto);
    await this.redis.set(RedisNamespace.Cache, cacheKey, result, 300);
    return result;
  }

  /**
   * Public detailed view of single professional profile by slug.
   */
  async getPublicProfessionalDetail(slug: string): Promise<PublicProfessionalResponseDto> {
    const cacheKey = `search:prof:detail:${slug}`;
    const cached = await this.redis.get<PublicProfessionalResponseDto>(
      RedisNamespace.Cache,
      cacheKey,
    );
    if (cached) {
      return cached;
    }

    const prof = await this.prisma.professionalProfile.findFirst({
      where: { slug, isPublished: true, deletedAt: null },
      include: {
        primaryLocality: { include: { city: { include: { state: true } } } },
        categoryMap: { include: { category: true } },
        serviceAreas: { include: { locality: { include: { city: true } } } },
        portfolioProjects: {
          where: { isPublished: true },
          orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }],
          include: { media: { orderBy: { displayOrder: 'asc' } } },
        },
      },
    });

    if (!prof) {
      throw new NotFoundException('Published ProfessionalProfile');
    }

    const dto = await this.mapToPublicDto(prof);
    await this.redis.set(RedisNamespace.Cache, cacheKey, dto, 300);
    return dto;
  }

  /**
   * Side-by-side comparison of 2 to 4 professionals.
   */
  async compareProfessionals(dto: CompareProfessionalsDto): Promise<PublicProfessionalResponseDto[]> {
    const rawIdentifiers = dto.identifiers || [];
    const uniqueIdentifiers = Array.from(new Set(rawIdentifiers));

    if (uniqueIdentifiers.length !== rawIdentifiers.length) {
      throw new ValidationException('Duplicate professional IDs in comparison request.');
    }

    if (uniqueIdentifiers.length < 2 || uniqueIdentifiers.length > 4) {
      throw new ValidationException('Comparison requires between 2 and 4 distinct professionals.');
    }

    const cacheKey = `search:compare:${uniqueIdentifiers.sort().join(',')}`;
    const cached = await this.redis.get<PublicProfessionalResponseDto[]>(
      RedisNamespace.Cache,
      cacheKey,
    );
    if (cached) {
      return cached;
    }

    const profs = await this.prisma.professionalProfile.findMany({
      where: {
        OR: [
          { id: { in: uniqueIdentifiers } },
          { slug: { in: uniqueIdentifiers } },
        ],
        isPublished: true,
        deletedAt: null,
      },
      include: {
        primaryLocality: { include: { city: { include: { state: true } } } },
        categoryMap: { include: { category: true } },
        serviceAreas: { include: { locality: { include: { city: true } } } },
        portfolioProjects: {
          where: { isPublished: true },
          orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }],
          include: { media: { orderBy: { displayOrder: 'asc' } } },
        },
      },
    });

    if (profs.length < 2) {
      throw new ValidationException('At least 2 matching published professionals are required for comparison.');
    }

    const dtos = await Promise.all(profs.map((p) => this.mapToPublicDto(p)));
    await this.redis.set(RedisNamespace.Cache, cacheKey, dtos, 300);
    return dtos;
  }
}
