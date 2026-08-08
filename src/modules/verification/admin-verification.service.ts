import { Injectable } from '@nestjs/common';
import {
  DocumentStatus,
  Prisma,
  VerificationLevel,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import {
  RedisNamespace,
  RedisService,
} from '../../infrastructure/redis/redis.service';
import { VerificationPolicyService } from './verification-policy.service';
import { VerificationLevelResolver } from './verification-level.resolver';
import { QueryVerificationQueueDto } from './dto/query-verification-queue.dto';
import { PatchDocumentDto } from './dto/patch-document.dto';
import { SubmitDecisionDto } from './dto/submit-decision.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../common/errors/domain.exception';
import { StateConflictException } from '../../common/utils/conditional-update.util';
import { ErrorCode } from '../../common/errors/error-codes';

@Injectable()
export class AdminVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly redis: RedisService,
    private readonly policyService: VerificationPolicyService,
    private readonly levelResolver: VerificationLevelResolver,
  ) {}

  /**
   * Queries paginated admin verification queue with filtering and sorting.
   */
  async queryQueue(dto: QueryVerificationQueueDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.VerificationRecordWhereInput = {};

    if (dto.status) {
      where.status = dto.status;
    }

    if (dto.cityId) {
      where.professional = {
        primaryLocality: {
          cityId: dto.cityId,
        },
      };
    }

    if (dto.documentType) {
      where.documents = {
        some: {
          documentType: dto.documentType,
        },
      };
    }

    if (dto.submittedAfter || dto.submittedBefore) {
      where.submittedAt = {};
      if (dto.submittedAfter) where.submittedAt.gte = dto.submittedAfter;
      if (dto.submittedBefore) where.submittedAt.lte = dto.submittedBefore;
    }

    let orderBy: Prisma.VerificationRecordOrderByWithRelationInput = {
      submittedAt: 'asc',
    };
    if (dto.sort) {
      const [field, direction] = dto.sort.split(':');
      if (field === 'submittedAt' || field === 'createdAt') {
        orderBy = { [field]: direction?.toLowerCase() === 'desc' ? 'desc' : 'asc' };
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.verificationRecord.count({ where }),
      this.prisma.verificationRecord.findMany({
        where,
        include: {
          professional: {
            select: {
              id: true,
              businessName: true,
              primaryLocality: { select: { id: true, name: true, cityId: true } },
              categoryMap: { select: { category: { select: { name: true, slug: true } } } },
            },
          },
          documents: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Returns verification record detail including short-lived S3 pre-signed read URLs.
   */
  async getRecordDetail(recordId: string) {
    const record = await this.prisma.verificationRecord.findUnique({
      where: { id: recordId },
      include: {
        professional: {
          include: {
            categoryMap: { include: { category: true } },
            primaryLocality: true,
          },
        },
        documents: true,
        history: { orderBy: { createdAt: 'desc' } },
        reviewer: { include: { user: { select: { email: true } } } },
      },
    });

    if (!record) {
      throw new NotFoundException('VerificationRecord');
    }

    // Attach presigned download URLs for document evidence
    const documentsWithUrls = await Promise.all(
      record.documents.map(async (doc) => {
        const { downloadUrl, expiresAt } = await this.s3.generateDownloadUrl({
          bucket: 'private',
          objectKey: doc.fileKey,
          expirySeconds: 900,
        });
        return {
          ...doc,
          downloadUrl,
          expiresAt,
        };
      }),
    );

    return {
      ...record,
      documents: documentsWithUrls,
    };
  }

  /**
   * Evaluates/patches an individual document's status (verified / rejected).
   */
  async patchDocumentStatus(documentId: string, dto: PatchDocumentDto) {
    const doc = await this.prisma.verificationDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException('VerificationDocument');
    }

    if (dto.status === DocumentStatus.rejected && !dto.rejectionReason) {
      throw new ValidationException(
        'A rejectionReason is required when rejecting a document.',
      );
    }

    return this.prisma.verificationDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        rejectionReason:
          dto.status === DocumentStatus.rejected ? dto.rejectionReason : null,
      },
    });
  }

  /**
   * Submits final decision on an application in a single atomic Prisma transaction
   * with optimistic locking version check and dynamic VerificationLevel resolution.
   */
  async submitDecision(adminUserId: string, recordId: string, dto: SubmitDecisionDto) {
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { userId: adminUserId },
      select: { id: true },
    });
    if (!adminUser) {
      throw new NotFoundException('AdminUser');
    }

    const notesRequiredStatuses: VerificationStatus[] = [
      VerificationStatus.rejected,
      VerificationStatus.info_requested,
      VerificationStatus.suspended,
    ];
    if (notesRequiredStatuses.includes(dto.targetStatus) && !dto.reviewerNotes) {
      throw new ValidationException(
        'reviewerNotes are required when decisioning to rejected, info_requested, or suspended.',
      );
    }

    const resultRecord = await this.prisma.$transaction(async (tx) => {
      // 1. Fetch record with optimistic version check
      const record = await tx.verificationRecord.findUnique({
        where: { id: recordId },
        include: {
          documents: true,
          professional: {
            include: { categoryMap: { include: { category: true } } },
          },
        },
      });

      if (!record) {
        throw new NotFoundException('VerificationRecord');
      }

      if (record.version !== dto.expectedVersion) {
        throw new StateConflictException(
          ErrorCode.CONFLICT,
          `State conflict: Verification record version has changed (current: ${record.version}, expected: ${dto.expectedVersion}).`,
        );
      }

      const categorySlugs = record.professional.categoryMap.map((cm) => cm.category.slug);

      // 2. Precondition check if approving
      if (dto.targetStatus === VerificationStatus.approved) {
        this.policyService.assertAllRequiredDocumentsVerified(
          categorySlugs,
          record.documents,
        );
      }

      // 3. Update VerificationRecord
      const updatedRecord = await tx.verificationRecord.update({
        where: { id: recordId, version: dto.expectedVersion },
        data: {
          status: dto.targetStatus,
          version: { increment: 1 },
          reviewedBy: adminUser.id,
          reviewerNotes: dto.reviewerNotes ?? null,
          reviewedAt: new Date(),
        },
      });

      // 4. Record audit history entry
      await tx.verificationHistory.create({
        data: {
          verificationRecordId: recordId,
          fromStatus: record.status,
          toStatus: dto.targetStatus,
          actorUserId: adminUserId,
          reason: dto.reviewerNotes ?? `Application status updated to ${dto.targetStatus}`,
        },
      });

      // 5. Calculate and apply VerificationLevel dynamically on ProfessionalProfile
      if (dto.targetStatus === VerificationStatus.approved) {
        const resolvedLevel = this.levelResolver.resolveLevel(
          categorySlugs,
          record.documents,
        );

        await tx.professionalProfile.update({
          where: { id: record.professionalId },
          data: {
            verificationLevel: resolvedLevel,
            verifiedAt: new Date(),
            isPublished: true,
          },
        });
      } else {
        const resetStatuses: VerificationStatus[] = [
          VerificationStatus.rejected,
          VerificationStatus.suspended,
        ];
        if (resetStatuses.includes(dto.targetStatus)) {
          await tx.professionalProfile.update({
            where: { id: record.professionalId },
            data: {
              verificationLevel: VerificationLevel.unverified,
              isPublished: false,
            },
          });
        }
      }

      return updatedRecord;
    });

    // 6. Post-commit Redis cache invalidation
    await this.redis.invalidatePattern(
      RedisNamespace.Cache,
      `professional:${resultRecord.professionalId}:*`,
    );

    return resultRecord;
  }
}
