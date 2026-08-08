import { Injectable } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import { VerificationPolicyService } from './verification-policy.service';
import { PresignedUrlRequestDto } from './dto/presigned-url-request.dto';
import { AttachDocumentDto } from './dto/attach-document.dto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../common/errors/domain.exception';

const ACTIVE_STATUSES = [
  VerificationStatus.draft,
  VerificationStatus.pending,
  VerificationStatus.info_requested,
];

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly policyService: VerificationPolicyService,
  ) {}

  /**
   * Creates a new draft verification application for the professional.
   * Fails if an active application already exists.
   */
  async createApplication(userId: string, roles: string[]) {
    if (!roles.includes('professional')) {
      throw new ForbiddenException(
        'Only users with the professional role may apply for verification.',
      );
    }

    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException('ProfessionalProfile');
    }

    // Check single active application rule
    const active = await this.prisma.verificationRecord.findFirst({
      where: {
        professionalId: professional.id,
        status: { in: ACTIVE_STATUSES },
      },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException(
        'An active verification application already exists.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.verificationRecord.create({
        data: {
          professionalId: professional.id,
          status: VerificationStatus.draft,
        },
        include: { documents: true, history: true },
      });

      await tx.verificationHistory.create({
        data: {
          verificationRecordId: record.id,
          fromStatus: VerificationStatus.draft,
          toStatus: VerificationStatus.draft,
          actorUserId: userId,
          reason: 'Initial application draft created',
        },
      });

      return record;
    });
  }

  /**
   * Returns active verification application for the calling professional.
   */
  async getActiveApplication(userId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException('ProfessionalProfile');
    }

    const record = await this.prisma.verificationRecord.findFirst({
      where: {
        professionalId: professional.id,
        status: { in: ACTIVE_STATUSES },
      },
      include: {
        documents: true,
        history: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!record) {
      throw new NotFoundException('Active VerificationRecord');
    }

    return record;
  }

  /**
   * Lists past and current verification history records for the professional (paginated).
   */
  async listApplicationHistory(userId: string, page = 1, limit = 20) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException('ProfessionalProfile');
    }

    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      this.prisma.verificationRecord.count({
        where: { professionalId: professional.id },
      }),
      this.prisma.verificationRecord.findMany({
        where: { professionalId: professional.id },
        include: {
          documents: true,
          history: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
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
   * Generates a pre-signed S3 upload URL for document upload.
   */
  async getPresignedUploadUrl(userId: string, dto: PresignedUrlRequestDto) {
    const activeRecord = await this.getActiveApplication(userId);
    const allowedStatuses: VerificationStatus[] = [
      VerificationStatus.draft,
      VerificationStatus.info_requested,
    ];

    if (!allowedStatuses.includes(activeRecord.status)) {
      throw new ValidationException(
        'Documents can only be uploaded when active application is in draft or info_requested status.',
      );
    }

    const keyPrefix = `verification-documents/${activeRecord.professionalId}`;
    return this.s3.generateUploadUrl({
      bucket: 'private',
      contentType: dto.mimeType,
      keyPrefix,
      expirySeconds: 900,
    });
  }

  /**
   * Attaches or updates a document evidence record on the active application.
   */
  async attachDocument(userId: string, dto: AttachDocumentDto) {
    const activeRecord = await this.getActiveApplication(userId);
    const allowedStatuses: VerificationStatus[] = [
      VerificationStatus.draft,
      VerificationStatus.info_requested,
    ];

    if (!allowedStatuses.includes(activeRecord.status)) {
      throw new ValidationException(
        'Documents can only be modified when active application is in draft or info_requested status.',
      );
    }

    return this.prisma.verificationDocument.upsert({
      where: {
        verificationRecordId_documentType: {
          verificationRecordId: activeRecord.id,
          documentType: dto.documentType,
        },
      },
      update: {
        documentNumber: dto.documentNumber ?? null,
        fileKey: dto.fileKey,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        checksum: dto.checksum ?? null,
        status: 'pending',
        rejectionReason: null,
      },
      create: {
        verificationRecordId: activeRecord.id,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber ?? null,
        fileKey: dto.fileKey,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        checksum: dto.checksum ?? null,
        status: 'pending',
      },
    });
  }

  /**
   * Deletes a document from the active draft application.
   */
  async deleteDocument(userId: string, documentId: string) {
    const activeRecord = await this.getActiveApplication(userId);
    const allowedStatuses: VerificationStatus[] = [
      VerificationStatus.draft,
      VerificationStatus.info_requested,
    ];

    if (!allowedStatuses.includes(activeRecord.status)) {
      throw new ValidationException(
        'Documents can only be removed when active application is in draft or info_requested status.',
      );
    }

    const document = await this.prisma.verificationDocument.findFirst({
      where: { id: documentId, verificationRecordId: activeRecord.id },
    });
    if (!document) {
      throw new NotFoundException('VerificationDocument');
    }

    await this.prisma.verificationDocument.delete({
      where: { id: documentId },
    });
  }

  /**
   * Submits the active application for admin review.
   */
  async submitApplication(userId: string) {
    const activeRecord = await this.getActiveApplication(userId);
    const allowedStatuses: VerificationStatus[] = [
      VerificationStatus.draft,
      VerificationStatus.info_requested,
    ];

    if (!allowedStatuses.includes(activeRecord.status)) {
      throw new ValidationException(
        'Application is not in a submittable state.',
      );
    }

    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: activeRecord.professionalId },
      include: {
        categoryMap: { include: { category: true } },
      },
    });
    if (!professional) {
      throw new NotFoundException('ProfessionalProfile');
    }

    const categorySlugs = professional.categoryMap.map((cm) => cm.category.slug);

    // Validate category mandatory documents
    this.policyService.assertAllRequiredDocumentsPresent(
      categorySlugs,
      activeRecord.documents,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.verificationRecord.update({
        where: { id: activeRecord.id },
        data: {
          status: VerificationStatus.pending,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
        include: { documents: true, history: true },
      });

      await tx.verificationHistory.create({
        data: {
          verificationRecordId: activeRecord.id,
          fromStatus: activeRecord.status,
          toStatus: VerificationStatus.pending,
          actorUserId: userId,
          reason: 'Application submitted for moderation review',
        },
      });

      return updated;
    });
  }
}
