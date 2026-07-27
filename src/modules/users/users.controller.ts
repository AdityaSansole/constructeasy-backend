import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard, AuthenticatedUser } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { MeResponse, UsersService } from './users.service';

@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('onboarding')
  async completeOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteOnboardingDto,
  ): Promise<MeResponse> {
    return this.usersService.completeOnboarding(user.id, dto);
  }
}
