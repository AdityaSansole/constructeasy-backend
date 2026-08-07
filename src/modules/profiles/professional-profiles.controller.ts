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
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ClerkAuthGuard,
  AuthenticatedUser,
} from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfessionalProfilesService } from './professional-profiles.service';
import { CreateProfessionalProfileDto } from './dto/create-professional-profile.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { CreateServiceAreaDto } from './dto/create-service-area.dto';
import { ReplaceCategoriesDto } from './dto/replace-categories.dto';

/**
 * ProfessionalProfilesController — spec Section 7.
 * ClerkAuthGuard only; role and ownership checks are service-layer business rules per spec Section 10.
 * Sub-resource routes (/service-areas, /categories) never take a professional id in their path —
 * resolved via req.user.id only, making cross-tenant access structurally impossible.
 */
@Controller('professional-profiles')
@UseGuards(ClerkAuthGuard)
export class ProfessionalProfilesController {
  constructor(private readonly service: ProfessionalProfilesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfessionalProfileDto,
  ) {
    return this.service.create(user.id, user.roles, dto);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMe(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfessionalProfileDto,
  ) {
    return this.service.updateMe(user.id, dto);
  }

  @Post('me/service-areas')
  @HttpCode(HttpStatus.CREATED)
  createServiceArea(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateServiceAreaDto,
  ) {
    return this.service.createServiceArea(user.id, dto);
  }

  @Get('me/service-areas')
  listServiceAreas(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listServiceAreas(user.id);
  }

  @Delete('me/service-areas/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteServiceArea(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.deleteServiceArea(user.id, id);
  }

  @Put('me/categories')
  replaceCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplaceCategoriesDto,
  ) {
    return this.service.replaceCategories(user.id, dto);
  }
}
