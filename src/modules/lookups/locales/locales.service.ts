import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class LocalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.locale.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });
  }
}
