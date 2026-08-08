import { Controller, Get, Param } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('professionals')
export class PublicProfessionalController {
  constructor(private readonly searchService: SearchService) {}

  @Get(':slug')
  getPublicProfessionalDetail(@Param('slug') slug: string) {
    return this.searchService.getPublicProfessionalDetail(slug);
  }
}
