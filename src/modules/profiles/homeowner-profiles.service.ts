import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateHomeownerProfileDto } from './dto/create-homeowner-profile.dto';
import { UpdateHomeownerProfileDto } from './dto/update-homeowner-profile.dto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/errors/domain.exception';

export interface HomeownerProfileResponse {
  id: string;
  fullName: string;
  localityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * HomeownerProfilesService — spec Section 7.
 * No cache invalidation applies (homeowner_profiles has no cached public view).
 */
@Injectable()
export class HomeownerProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    roles: string[],
    dto: CreateHomeownerProfileDto,
  ): Promise<HomeownerProfileResponse> {
    if (!roles.includes('homeowner')) {
      throw new ForbiddenException(
        'Only users with the homeowner role may create a homeowner profile.',
      );
    }

    if (dto.localityId) {
      await this.assertLocalityExists(dto.localityId);
    }

    // Application-level existence check before insert — clean 409 instead of raw P2002.
    const existing = await this.prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A homeowner profile already exists for this account.',
      );
    }

    try {
      const profile = await this.prisma.homeownerProfile.create({
        data: {
          userId,
          fullName: dto.fullName,
          localityId: dto.localityId ?? null,
        },
        select: this.selectFields(),
      });
      return this.toResponse(profile);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A homeowner profile already exists for this account.',
        );
      }
      throw err;
    }
  }

  async getMe(userId: string): Promise<HomeownerProfileResponse> {
    const profile = await this.prisma.homeownerProfile.findUnique({
      where: { userId },
      select: this.selectFields(),
    });
    if (!profile) {
      throw new NotFoundException('HomeownerProfile');
    }
    return this.toResponse(profile);
  }

  async updateMe(
    userId: string,
    dto: UpdateHomeownerProfileDto,
  ): Promise<HomeownerProfileResponse> {
    const profile = await this.prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('HomeownerProfile');
    }

    // Validate locality if provided and not being cleared
    if (dto.localityId !== undefined && dto.localityId !== null) {
      await this.assertLocalityExists(dto.localityId);
    }

    const data: Prisma.HomeownerProfileUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.localityId !== undefined) {
      data.locality =
        dto.localityId === null
          ? { disconnect: true }
          : { connect: { id: dto.localityId } };
    }

    const updated = await this.prisma.homeownerProfile.update({
      where: { userId },
      data,
      select: this.selectFields(),
    });
    return this.toResponse(updated);
  }

  private async assertLocalityExists(localityId: string): Promise<void> {
    const locality = await this.prisma.locality.findUnique({
      where: { id: localityId },
      select: { id: true },
    });
    if (!locality) {
      throw new NotFoundException('Locality');
    }
  }

  private selectFields() {
    return {
      id: true,
      fullName: true,
      localityId: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private toResponse(profile: {
    id: string;
    fullName: string;
    localityId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): HomeownerProfileResponse {
    return {
      id: profile.id,
      fullName: profile.fullName,
      localityId: profile.localityId,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
