import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { StatesService } from './states.service';

@Controller('countries/:countryId/states')
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @Get()
  async findByCountry(
    @Param('countryId', new ParseUUIDPipe()) countryId: string,
  ) {
    return this.statesService.findByCountry(countryId);
  }
}
