import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  ClerkAuthGuard,
} from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PortfolioService } from './portfolio.service';
import { PortfolioMediaService } from './portfolio-media.service';
import { CreatePortfolioProjectDto } from './dto/create-portfolio-project.dto';
import { UpdatePortfolioProjectDto } from './dto/update-portfolio-project.dto';
import { PresignedMediaUrlDto } from './dto/presigned-media-url.dto';
import { AttachPortfolioMediaDto } from './dto/attach-portfolio-media.dto';

@Controller('profiles/me/projects')
@UseGuards(ClerkAuthGuard)
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly mediaService: PortfolioMediaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createProject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePortfolioProjectDto,
  ) {
    return this.portfolioService.createProject(user.id, user.roles, dto);
  }

  @Get()
  listMyProjects(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.portfolioService.listMyProjects(user.id, pageNum, limitNum);
  }

  @Get(':id')
  getMyProjectDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.portfolioService.getMyProjectDetail(user.id, id);
  }

  @Patch(':id')
  updateProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePortfolioProjectDto,
  ) {
    return this.portfolioService.updateProject(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.portfolioService.deleteProject(user.id, id);
  }

  @Post(':id/media/presigned-url')
  @HttpCode(HttpStatus.CREATED)
  getPresignedUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PresignedMediaUrlDto,
  ) {
    return this.mediaService.getPresignedUploadUrl(user.id, id, dto);
  }

  @Post(':id/media')
  @HttpCode(HttpStatus.CREATED)
  attachMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AttachPortfolioMediaDto,
  ) {
    return this.mediaService.attachMedia(user.id, id, dto);
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.mediaService.deleteMedia(user.id, id, mediaId);
  }
}
