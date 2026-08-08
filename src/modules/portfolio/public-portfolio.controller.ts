import { Controller, Get, Param, Query } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

@Controller('professionals/:slug/projects')
export class PublicPortfolioController {
  constructor(private readonly service: PortfolioService) {}

  @Get()
  listPublicProjects(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.service.listPublicProjects(slug, pageNum, limitNum);
  }

  @Get(':projectSlug')
  getPublicProjectDetail(
    @Param('slug') slug: string,
    @Param('projectSlug') projectSlug: string,
  ) {
    return this.service.getPublicProjectDetail(slug, projectSlug);
  }
}
