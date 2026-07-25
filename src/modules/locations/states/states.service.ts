import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { NotFoundException } from '../../../common/errors/domain.exception';

@Injectable()
export class StatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCountry(countryId: string) {
    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
    });
    if (!country) {
      throw new NotFoundException('Country');
    }

    return this.prisma.state.findMany({
      where: { countryId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
  }
}
