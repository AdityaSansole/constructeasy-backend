import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ClerkAuthGuard,
  AuthenticatedUser,
} from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HomeownerProfilesService } from './homeowner-profiles.service';
import { CreateHomeownerProfileDto } from './dto/create-homeowner-profile.dto';
import { UpdateHomeownerProfileDto } from './dto/update-homeowner-profile.dto';

/**
 * HomeownerProfilesController — spec Section 7.
 * ClerkAuthGuard only; role possession is a service-layer business rule per spec Section 10.
 */
@Controller('homeowner-profiles')
@UseGuards(ClerkAuthGuard)
export class HomeownerProfilesController {
  constructor(private readonly service: HomeownerProfilesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHomeownerProfileDto,
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
    @Body() dto: UpdateHomeownerProfileDto,
  ) {
    return this.service.updateMe(user.id, dto);
  }
}
