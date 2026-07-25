import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { LocalitiesService } from './localities.service';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

@Controller('cities/:cityId/localities')
export class LocalitiesController {
  constructor(private readonly localitiesService: LocalitiesService) {}

  @Get()
  async findByCity(
    @Param('cityId', new ParseUUIDPipe()) cityId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.localitiesService.findByCity(cityId, query);
  }
}
