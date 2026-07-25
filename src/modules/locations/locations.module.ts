import { Module } from '@nestjs/common';
import { CountriesController } from './countries/countries.controller';
import { CountriesService } from './countries/countries.service';
import { StatesController } from './states/states.controller';
import { StatesService } from './states/states.service';
import { CitiesController } from './cities/cities.controller';
import { CitiesService } from './cities/cities.service';
import { LocalitiesController } from './localities/localities.controller';
import { LocalitiesService } from './localities/localities.service';

@Module({
  controllers: [
    CountriesController,
    StatesController,
    CitiesController,
    LocalitiesController,
  ],
  providers: [
    CountriesService,
    StatesService,
    CitiesService,
    LocalitiesService,
  ],
})
export class LocationsModule {}
