import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { NotFoundException } from '../../../common/errors/domain.exception';

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByState(stateId: string) {
    const state = await this.prisma.state.findUnique({ where: { id: stateId } });
    if (!state) {
      throw new NotFoundException('State');
    }

    return this.prisma.city.findMany({
      where: { stateId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  }
}
