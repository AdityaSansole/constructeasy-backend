import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import {
  ConflictException,
  NotFoundException,
} from '../../common/errors/domain.exception';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { userRoles: { include: { role: true } } };
}>;

export interface MeResponse {
  id: string;
  email: string | null;
  phone: string | null;
  localeId: string | null;
  roles: string[];
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new NotFoundException('User');
    }

    return this.toMeResponse(user);
  }

  async completeOnboarding(
    userId: string,
    dto: CompleteOnboardingDto,
  ): Promise<MeResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existingRole = await tx.userRole.findFirst({
        where: { userId },
        select: { id: true },
      });

      if (existingRole) {
        throw new ConflictException(
          'Onboarding has already been completed for this account.',
        );
      }

      const role = await tx.role.findUnique({
        where: { name: dto.role },
      });

      if (!role) {
        throw new NotFoundException('Role');
      }

      try {
        await tx.userRole.create({
          data: { userId, roleId: role.id },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException(
            'Onboarding has already been completed for this account.',
          );
        }
        throw err;
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user) {
        throw new NotFoundException('User');
      }

      return this.toMeResponse(user);
    });
  }

  private toMeResponse(user: UserWithRoles): MeResponse {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      localeId: user.localeId,
      roles: user.userRoles.map((userRole) => userRole.role.name),
      createdAt: user.createdAt,
    };
  }
}
