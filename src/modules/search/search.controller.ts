import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { SearchProjectsDto } from './dto/search-projects.dto';
import { CompareProfessionalsDto } from './dto/compare-professionals.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('professionals')
  searchProfessionals(@Query() query: SearchProfessionalsDto) {
    return this.searchService.searchProfessionals(query);
  }

  @Get('projects')
  searchProjects(@Query() query: SearchProjectsDto) {
    return this.searchService.searchProjects(query);
  }

  @Get('compare')
  compareProfessionals(@Query() query: CompareProfessionalsDto) {
    return this.searchService.compareProfessionals(query);
  }
}
