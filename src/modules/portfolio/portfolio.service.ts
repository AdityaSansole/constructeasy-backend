import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import {
  RedisNamespace,
  RedisService,
} from '../../infrastructure/redis/redis.service';
import { slugify } from '../../common/utils/slug.util';
import { CreatePortfolioProjectDto } from './dto/create-portfolio-project.dto';
import { UpdatePortfolioProjectDto } from './dto/update-portfolio-project.dto';
import {
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../common/errors/domain.exception';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly redis: RedisService,
  ) {}

  /**
   * Safe unique slug generation for portfolio projects.
   */
  private async generateUniqueSlug(title: string, currentId?: string): Promise<string> {
    const baseSlug = slugify(title) || 'project';
    let slug = baseSlug;
    let count = 1;
    let attempts = 0;

    while (attempts < 100) {
      attempts++;
      const existing = await this.prisma.portfolioProject.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing || (currentId && existing.id === currentId)) {
        return slug;
      }

      slug = `${baseSlug}-${count}`;
      count++;
    }

    return `${baseSlug}-${Date.now()}`;
  }

  /**
   * Helper to fetch calling professional profile.
   */
  private async getProfessionalProfile(userId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, isPublished: true },
    });

    if (!professional) {
      throw new NotFoundException('ProfessionalProfile');
    }

    return professional;
  }

  /**
   * Creates a portfolio project for the authenticated professional.
   * Atomically increments ProfessionalProfile.projectCount.
   */
  async createProject(userId: string, roles: string[], dto: CreatePortfolioProjectDto) {
    if (!roles.includes('professional')) {
      throw new ForbiddenException(
        'Only users with the professional role may create portfolio projects.',
      );
    }

    const professional = await this.getProfessionalProfile(userId);

    if (dto.localityId) {
      const locality = await this.prisma.locality.findUnique({
        where: { id: dto.localityId },
      });
      if (!locality) {
        throw new ValidationException(`Locality with ID '${dto.localityId}' not found.`);
      }
    }

    const slug = await this.generateUniqueSlug(dto.title);

    const project = await this.prisma.$transaction(async (tx) => {
      const newProject = await tx.portfolioProject.create({
        data: {
          professionalId: professional.id,
          title: dto.title,
          slug,
          description: dto.description ?? null,
          projectType: dto.projectType ?? null,
          completionYear: dto.completionYear ?? null,
          costInr: dto.costInr ?? null,
          localityId: dto.localityId ?? null,
          isFeatured: dto.isFeatured ?? false,
          isPublished: dto.isPublished ?? true,
          displayOrder: dto.displayOrder ?? 0,
        },
        include: {
          locality: true,
          media: { orderBy: { displayOrder: 'asc' } },
        },
      });

      // Atomic projectCount increment
      await tx.professionalProfile.update({
        where: { id: professional.id },
        data: { projectCount: { increment: 1 } },
      });

      return newProject;
    });

    // Invalidate Redis cache post-commit
    await this.redis.invalidatePattern(
      RedisNamespace.Cache,
      `professional:${professional.id}:portfolio:*`,
    );

    return project;
  }

  /**
   * Lists portfolio projects belonging to calling professional (paginated).
   */
  async listMyProjects(userId: string, page = 1, limit = 20) {
    const professional = await this.getProfessionalProfile(userId);
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.portfolioProject.count({
        where: { professionalId: professional.id },
      }),
      this.prisma.portfolioProject.findMany({
        where: { professionalId: professional.id },
        include: {
          locality: true,
          media: { orderBy: { displayOrder: 'asc' } },
        },
        orderBy: { displayOrder: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    // Attach pre-signed URLs for media
    const itemsWithUrls = await Promise.all(
      items.map(async (p) => ({
        ...p,
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

    return {
      items: itemsWithUrls,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Gets single portfolio project detail for calling professional.
   */
  async getMyProjectDetail(userId: string, projectId: string) {
    const professional = await this.getProfessionalProfile(userId);

    const project = await this.prisma.portfolioProject.findFirst({
      where: { id: projectId, professionalId: professional.id },
      include: {
        locality: true,
        media: { orderBy: { displayOrder: 'asc' } },
      },
    });

    if (!project) {
      throw new NotFoundException('PortfolioProject');
    }

    const mediaWithUrls = await Promise.all(
      project.media.map(async (m) => {
        const { downloadUrl } = await this.s3.generateDownloadUrl({
          bucket: 'public',
          objectKey: m.fileKey,
        });
        return { ...m, downloadUrl };
      }),
    );

    return { ...project, media: mediaWithUrls };
  }

  /**
   * Updates portfolio project metadata.
   */
  async updateProject(userId: string, projectId: string, dto: UpdatePortfolioProjectDto) {
    const professional = await this.getProfessionalProfile(userId);

    const existing = await this.prisma.portfolioProject.findFirst({
      where: { id: projectId, professionalId: professional.id },
    });
    if (!existing) {
      throw new NotFoundException('PortfolioProject');
    }

    if (dto.localityId) {
      const locality = await this.prisma.locality.findUnique({
        where: { id: dto.localityId },
      });
      if (!locality) {
        throw new ValidationException(`Locality with ID '${dto.localityId}' not found.`);
      }
    }

    let slug = existing.slug;
    if (dto.title && dto.title !== existing.title) {
      slug = await this.generateUniqueSlug(dto.title, existing.id);
    }

    const updated = await this.prisma.portfolioProject.update({
      where: { id: projectId },
      data: {
        title: dto.title ?? existing.title,
        slug,
        description: dto.description !== undefined ? dto.description : existing.description,
        projectType: dto.projectType !== undefined ? dto.projectType : existing.projectType,
        completionYear: dto.completionYear !== undefined ? dto.completionYear : existing.completionYear,
        costInr: dto.costInr !== undefined ? dto.costInr : existing.costInr,
        localityId: dto.localityId !== undefined ? dto.localityId : existing.localityId,
        isFeatured: dto.isFeatured ?? existing.isFeatured,
        isPublished: dto.isPublished ?? existing.isPublished,
        displayOrder: dto.displayOrder ?? existing.displayOrder,
      },
      include: {
        locality: true,
        media: { orderBy: { displayOrder: 'asc' } },
      },
    });

    // Invalidate Redis cache post-commit
    await this.redis.invalidatePattern(
      RedisNamespace.Cache,
      `professional:${professional.id}:portfolio:*`,
    );

    return updated;
  }

  /**
   * Deletes portfolio project and cascade deletes media.
   * Atomically decrements ProfessionalProfile.projectCount.
   */
  async deleteProject(userId: string, projectId: string) {
    const professional = await this.getProfessionalProfile(userId);

    const existing = await this.prisma.portfolioProject.findFirst({
      where: { id: projectId, professionalId: professional.id },
    });
    if (!existing) {
      throw new NotFoundException('PortfolioProject');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.portfolioProject.delete({
        where: { id: projectId },
      });

      // Atomic projectCount decrement
      await tx.professionalProfile.update({
        where: { id: professional.id },
        data: { projectCount: { decrement: 1 } },
      });
    });

    // Invalidate Redis cache post-commit
    await this.redis.invalidatePattern(
      RedisNamespace.Cache,
      `professional:${professional.id}:portfolio:*`,
    );
  }

  /**
   * Public paginated listing of published projects for published professional profile.
   */
  async listPublicProjects(profSlug: string, page = 1, limit = 20) {
    const professional = await this.prisma.professionalProfile.findFirst({
      where: { slug: profSlug, isPublished: true, deletedAt: null },
      select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException('Published ProfessionalProfile');
    }

    const cacheKey = `professional:${professional.id}:portfolio:list:${page}:${limit}`;
    const cached = await this.redis.get<any>(RedisNamespace.Cache, cacheKey);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.portfolioProject.count({
        where: { professionalId: professional.id, isPublished: true },
      }),
      this.prisma.portfolioProject.findMany({
        where: { professionalId: professional.id, isPublished: true },
        include: {
          locality: true,
          media: { orderBy: { displayOrder: 'asc' } },
        },
        orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const itemsWithUrls = await Promise.all(
      items.map(async (p) => ({
        ...p,
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

    const result = {
      items: itemsWithUrls,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.redis.set(RedisNamespace.Cache, cacheKey, result, 300); // 5 min TTL
    return result;
  }

  /**
   * Public detailed view of single published project.
   */
  async getPublicProjectDetail(profSlug: string, projectSlug: string) {
    const professional = await this.prisma.professionalProfile.findFirst({
      where: { slug: profSlug, isPublished: true, deletedAt: null },
      select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException('Published ProfessionalProfile');
    }

    const cacheKey = `professional:${professional.id}:portfolio:detail:${projectSlug}`;
    const cached = await this.redis.get<any>(RedisNamespace.Cache, cacheKey);
    if (cached) {
      return cached;
    }

    const project = await this.prisma.portfolioProject.findFirst({
      where: {
        slug: projectSlug,
        professionalId: professional.id,
        isPublished: true,
      },
      include: {
        locality: true,
        media: { orderBy: { displayOrder: 'asc' } },
      },
    });

    if (!project) {
      throw new NotFoundException('Published PortfolioProject');
    }

    const mediaWithUrls = await Promise.all(
      project.media.map(async (m) => {
        const { downloadUrl } = await this.s3.generateDownloadUrl({
          bucket: 'public',
          objectKey: m.fileKey,
        });
        return { ...m, downloadUrl };
      }),
    );

    const result = { ...project, media: mediaWithUrls };

    await this.redis.set(RedisNamespace.Cache, cacheKey, result, 300);
    return result;
  }
}
