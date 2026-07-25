import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { NotFoundException } from '../../../common/errors/domain.exception';
import {
  buildPaginatedResult,
  PaginationQueryDto,
  toPrismaPagination,
} from '../../../common/dto/pagination.dto';

@Injectable()
export class LocalitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCity(cityId: string, query: PaginationQueryDto) {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new NotFoundException('City');
    }

    const { skip, take } = toPrismaPagination(query);
    const [items, totalCount] = await Promise.all([
      this.prisma.locality.findMany({
        where: { cityId },
        orderBy: { name: 'asc' },
        skip,
        take,
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.locality.count({ where: { cityId } }),
    ]);

    return buildPaginatedResult(items, totalCount, query);
  }
}
