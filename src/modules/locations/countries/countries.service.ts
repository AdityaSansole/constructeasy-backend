import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class CountriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const countries = await this.prisma.country.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isoCode: true },
    });

    return countries.map((c) => ({
      id: c.id,
      name: c.name,
      iso_code: c.isoCode,
    }));
  }
}
