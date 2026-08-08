import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  buildPaginatedResult,
  Paginated,
  toPrismaPagination,
} from '../../common/dto/pagination.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { DeclineContactDto } from './dto/decline-contact.dto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../common/errors/domain.exception';
import {
  assertConditionalUpdateApplied,
} from '../../common/utils/conditional-update.util';
import { ErrorCode } from '../../common/errors/error-codes';
import { ContactStatus, Prisma } from '@prisma/client';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Homeowner creates a lead inquiry to a verified, published professional.
   */
  async createContact(userId: string, roles: string[], dto: CreateContactDto) {
    const homeowner = await this.prisma.homeownerProfile.findUnique({
      where: { userId },
    });

    if (!homeowner) {
      throw new ForbiddenException(
        'Only users with an active Homeowner profile can send contact inquiries.',
      );
    }

    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: dto.professionalId },
    });

    if (!professional) {
      throw new NotFoundException('ProfessionalProfile');
    }

    // AC-7.2: Verification & Publish Gating
    if (
      !professional.isPublished ||
      professional.deletedAt !== null ||
      (professional.verificationLevel !== 'level_1' &&
        professional.verificationLevel !== 'level_2')
    ) {
      throw new ValidationException(
        'Contact inquiries can only be sent to published, verified professionals.',
      );
    }

    // AC-7.8: Project Context Ownership Validation
    if (dto.projectId) {
      const project = await this.prisma.portfolioProject.findUnique({
        where: { id: dto.projectId },
        select: { id: true, professionalId: true },
      });
      if (!project || project.professionalId !== professional.id) {
        throw new ValidationException('Invalid project context.');
      }
    }

    // AC-7.9: Check duplicate active pending lead
    const existingPending = await this.prisma.contact.findFirst({
      where: {
        homeownerId: homeowner.id,
        professionalId: professional.id,
        status: ContactStatus.pending,
      },
    });

    if (existingPending) {
      throw new ConflictException(
        'Active pending contact already exists for this professional.',
      );
    }

    try {
      // AC-7.6 & AC-7.7: Atomic creation and NULL -> pending ContactHistory
      return await this.prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: {
            homeownerId: homeowner.id,
            professionalId: professional.id,
            projectId: dto.projectId ?? null,
            localityId: dto.localityId ?? null,
            message: dto.message,
            phone: dto.phone ?? null,
            email: dto.email ?? null,
            budgetInr: dto.budgetInr ?? null,
            timeline: dto.timeline ?? null,
            status: ContactStatus.pending,
          },
          include: {
            professional: {
              select: { id: true, businessName: true, slug: true },
            },
            homeowner: { select: { id: true, fullName: true } },
            project: { select: { id: true, title: true, slug: true } },
            locality: { select: { id: true, name: true } },
          },
        });

        await tx.contactHistory.create({
          data: {
            contactId: contact.id,
            fromStatus: null,
            toStatus: ContactStatus.pending,
            actorUserId: userId,
          },
        });

        return contact;
      });
    } catch (err: any) {
      // AC-7.15: Catch DB partial unique constraint race (P2002)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'Active pending contact already exists for this professional.',
        );
      }
      throw err;
    }
  }

  /**
   * Lists contacts with direction filtering for dual-role users.
   */
  async listContacts(userId: string, query: QueryContactsDto): Promise<Paginated<any>> {
    const [homeowner, professional] = await Promise.all([
      this.prisma.homeownerProfile.findUnique({ where: { userId } }),
      this.prisma.professionalProfile.findUnique({ where: { userId } }),
    ]);

    let direction = query.direction;

    if (!direction) {
      if (homeowner && !professional) direction = 'sent';
      else if (professional && !homeowner) direction = 'received';
      else if (homeowner && professional) {
        direction = 'sent'; // Default to sent if direction not specified
      } else {
        throw new ForbiddenException('User has no active profile.');
      }
    }

    const where: Prisma.ContactWhereInput = {};

    if (direction === 'sent') {
      if (!homeowner) {
        throw new ForbiddenException('User does not have a Homeowner profile for sent contacts.');
      }
      where.homeownerId = homeowner.id;
    } else {
      if (!professional) {
        throw new ForbiddenException('User does not have a Professional profile for received contacts.');
      }
      where.professionalId = professional.id;
    }

    if (query.status) {
      where.status = query.status;
    }

    const { skip, take } = toPrismaPagination(query);

    const [totalCount, rows] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          professional: {
            select: { id: true, businessName: true, slug: true, verificationLevel: true },
          },
          homeowner: { select: { id: true, fullName: true } },
          project: { select: { id: true, title: true, slug: true } },
          locality: { select: { id: true, name: true } },
        },
      }),
    ]);

    return buildPaginatedResult(rows, totalCount, query);
  }

  /**
   * Gets single contact detail with PII isolation (accessible only to sender/receiver).
   */
  async getContactDetail(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        professional: {
          select: { id: true, userId: true, businessName: true, slug: true },
        },
        homeowner: { select: { id: true, userId: true, fullName: true } },
        project: { select: { id: true, title: true, slug: true } },
        locality: { select: { id: true, name: true } },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact');
    }

    // AC-7.10 & IDOR Check: Must be sender homeowner OR target professional
    if (contact.homeowner.userId !== userId && contact.professional.userId !== userId) {
      throw new NotFoundException('Contact'); // 404 to avoid information disclosure
    }

    return contact;
  }

  /**
   * Professional accepts lead inquiry.
   */
  async acceptContact(userId: string, contactId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new ForbiddenException('Only professionals can accept contacts.');
    }

    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, professionalId: professional.id },
    });
    if (!contact) {
      throw new NotFoundException('Contact');
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.contact.updateMany({
        where: { id: contactId, status: ContactStatus.pending },
        data: {
          status: ContactStatus.accepted,
          respondedAt: new Date(),
        },
      });

      assertConditionalUpdateApplied(
        result.count,
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Contact is no longer pending and cannot be accepted.',
      );

      await tx.contactHistory.create({
        data: {
          contactId,
          fromStatus: ContactStatus.pending,
          toStatus: ContactStatus.accepted,
          actorUserId: userId,
        },
      });

      return tx.contact.findUnique({
        where: { id: contactId },
        include: { history: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  /**
   * Professional declines lead inquiry.
   */
  async declineContact(userId: string, contactId: string, dto: DeclineContactDto) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { userId },
    });
    if (!professional) {
      throw new ForbiddenException('Only professionals can decline contacts.');
    }

    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, professionalId: professional.id },
    });
    if (!contact) {
      throw new NotFoundException('Contact');
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.contact.updateMany({
        where: { id: contactId, status: ContactStatus.pending },
        data: {
          status: ContactStatus.declined,
          declinedReason: dto.reason ?? null,
          respondedAt: new Date(),
        },
      });

      assertConditionalUpdateApplied(
        result.count,
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Contact is no longer pending and cannot be declined.',
      );

      await tx.contactHistory.create({
        data: {
          contactId,
          fromStatus: ContactStatus.pending,
          toStatus: ContactStatus.declined,
          actorUserId: userId,
          reason: dto.reason ?? null,
        },
      });

      return tx.contact.findUnique({
        where: { id: contactId },
        include: { history: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  /**
   * Homeowner cancels pending lead inquiry.
   */
  async cancelContact(userId: string, contactId: string) {
    const homeowner = await this.prisma.homeownerProfile.findUnique({
      where: { userId },
    });
    if (!homeowner) {
      throw new ForbiddenException('Only homeowners can cancel contacts.');
    }

    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, homeownerId: homeowner.id },
    });
    if (!contact) {
      throw new NotFoundException('Contact');
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.contact.updateMany({
        where: { id: contactId, status: ContactStatus.pending },
        data: { status: ContactStatus.canceled },
      });

      assertConditionalUpdateApplied(
        result.count,
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Contact is no longer pending and cannot be canceled.',
      );

      await tx.contactHistory.create({
        data: {
          contactId,
          fromStatus: ContactStatus.pending,
          toStatus: ContactStatus.canceled,
          actorUserId: userId,
        },
      });

      return tx.contact.findUnique({
        where: { id: contactId },
        include: { history: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  /**
   * Homeowner or Professional archives an accepted, declined, or canceled contact.
   */
  async archiveContact(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: { homeowner: true, professional: true },
    });

    if (!contact) {
      throw new NotFoundException('Contact');
    }

    // Authorization check
    if (contact.homeowner.userId !== userId && contact.professional.userId !== userId) {
      throw new NotFoundException('Contact');
    }

    // AC-7.11: Archival allowed ONLY from accepted, declined, or canceled
    const currentStatus = contact.status;
    if (
      currentStatus !== ContactStatus.accepted &&
      currentStatus !== ContactStatus.declined &&
      currentStatus !== ContactStatus.canceled
    ) {
      assertConditionalUpdateApplied(
        0,
        ErrorCode.INVALID_STATUS_TRANSITION,
        `Contact cannot be archived from status '${currentStatus}'.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.contact.updateMany({
        where: { id: contactId, status: currentStatus },
        data: { status: ContactStatus.archived },
      });

      assertConditionalUpdateApplied(
        result.count,
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Contact was modified by another request.',
      );

      await tx.contactHistory.create({
        data: {
          contactId,
          fromStatus: currentStatus,
          toStatus: ContactStatus.archived,
          actorUserId: userId,
        },
      });

      return tx.contact.findUnique({
        where: { id: contactId },
        include: { history: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }
}
