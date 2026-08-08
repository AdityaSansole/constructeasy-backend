import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import {
  RedisNamespace,
  RedisService,
} from '../../infrastructure/redis/redis.service';
import { PresignedMediaUrlDto } from './dto/presigned-media-url.dto';
import { AttachPortfolioMediaDto } from './dto/attach-portfolio-media.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../common/errors/domain.exception';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class PortfolioMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly redis: RedisService,
  ) {}

  /**
   * Helper to verify calling professional profile exists and owns the target portfolio project.
   */
  private async getOwnedProject(userId: string, projectId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!professional) {
      throw new NotFoundException('ProfessionalProfile');
    }

    const project = await this.prisma.portfolioProject.findFirst({
      where: { id: projectId, professionalId: professional.id },
    });

    if (!project) {
      throw new NotFoundException('PortfolioProject');
    }

    return { professional, project };
  }

  /**
   * Generates a pre-signed S3 upload URL for a portfolio image in the public bucket.
   */
  async getPresignedUploadUrl(
    userId: string,
    projectId: string,
    dto: PresignedMediaUrlDto,
  ) {
    if (!ALLOWED_MIME_TYPES.includes(dto.mimeType)) {
      throw new ValidationException(
        `Invalid MIME type '${dto.mimeType}'. Allowed image types: image/jpeg, image/png, image/webp.`,
      );
    }

    if (dto.fileSize > MAX_FILE_SIZE) {
      throw new ValidationException(
        `File size exceeds maximum allowed limit of 10 MB.`,
      );
    }

    const { professional, project } = await this.getOwnedProject(
      userId,
      projectId,
    );

    const keyPrefix = `portfolio-media/${professional.id}/${project.id}`;
    return this.s3.generateUploadUrl({
      bucket: 'public',
      contentType: dto.mimeType,
      keyPrefix,
      expirySeconds: 900,
    });
  }

  /**
   * Attaches an uploaded media asset to a portfolio project.
   * Handles cover image replacement atomically via a Prisma transaction.
   */
  async attachMedia(
    userId: string,
    projectId: string,
    dto: AttachPortfolioMediaDto,
  ) {
    if (!ALLOWED_MIME_TYPES.includes(dto.mimeType)) {
      throw new ValidationException(
        `Invalid MIME type '${dto.mimeType}'. Allowed image types: image/jpeg, image/png, image/webp.`,
      );
    }

    if (dto.fileSize > MAX_FILE_SIZE) {
      throw new ValidationException(
        `File size exceeds maximum allowed limit of 10 MB.`,
      );
    }

    const { professional, project } = await this.getOwnedProject(
      userId,
      projectId,
    );

    const isCover = dto.isCover ?? false;

    const mediaRecord = await this.prisma.$transaction(async (tx) => {
      // Single Cover Image Invariant: If isCover = true, unset cover flag on existing project media
      if (isCover) {
        await tx.portfolioMedia.updateMany({
          where: { portfolioProjectId: project.id, isCover: true },
          data: { isCover: false },
        });
      }

      return tx.portfolioMedia.create({
        data: {
          portfolioProjectId: project.id,
          fileKey: dto.fileKey,
          originalFilename: dto.originalFilename,
          mimeType: dto.mimeType,
          fileSize: dto.fileSize,
          width: dto.width ?? null,
          height: dto.height ?? null,
          caption: dto.caption ?? null,
          displayOrder: dto.displayOrder ?? 0,
          isCover,
        },
      });
    });

    // Invalidate Redis cache post-commit
    await this.redis.invalidatePattern(
      RedisNamespace.Cache,
      `professional:${professional.id}:portfolio:*`,
    );

    return mediaRecord;
  }

  /**
   * Deletes a portfolio media asset.
   */
  async deleteMedia(userId: string, projectId: string, mediaId: string) {
    const { professional, project } = await this.getOwnedProject(
      userId,
      projectId,
    );

    const media = await this.prisma.portfolioMedia.findFirst({
      where: { id: mediaId, portfolioProjectId: project.id },
    });

    if (!media) {
      throw new NotFoundException('PortfolioMedia');
    }

    await this.prisma.portfolioMedia.delete({
      where: { id: mediaId },
    });

    // Invalidate Redis cache post-commit
    await this.redis.invalidatePattern(
      RedisNamespace.Cache,
      `professional:${professional.id}:portfolio:*`,
    );
  }
}
