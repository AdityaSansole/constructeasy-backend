import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CitiesService } from './cities.service';

@Controller('states/:stateId/cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  async findByState(@Param('stateId', new ParseUUIDPipe()) stateId: string) {
    return this.citiesService.findByState(stateId);
  }
}
