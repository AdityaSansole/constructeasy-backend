import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard, AuthenticatedUser } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MeResponse, UsersService } from './users.service';

@Controller('me')
@UseGuards(ClerkAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.usersService.getMe(user.id);
  }
}
