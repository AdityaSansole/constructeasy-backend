import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const PUBLIC_ROLE_NAMES = ['homeowner', 'professional'] as const;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublicRoles() {
    return this.prisma.role.findMany({
      where: { name: { in: [...PUBLIC_ROLE_NAMES] } },
      select: { id: true, name: true },
    });
  }
}
