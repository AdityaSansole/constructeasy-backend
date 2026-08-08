import {
  Body,
  Controller,
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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminVerificationService } from './admin-verification.service';
import { QueryVerificationQueueDto } from './dto/query-verification-queue.dto';
import { PatchDocumentDto } from './dto/patch-document.dto';
import { SubmitDecisionDto } from './dto/submit-decision.dto';

@Controller('admin/verification')
@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles('verification_admin', 'super_admin')
export class AdminVerificationController {
  constructor(private readonly service: AdminVerificationService) {}

  @Get('records')
  queryQueue(@Query() query: QueryVerificationQueueDto) {
    return this.service.queryQueue(query);
  }

  @Get('records/:id')
  getRecordDetail(@Param('id') id: string) {
    return this.service.getRecordDetail(id);
  }

  @Patch('documents/:id')
  patchDocumentStatus(
    @Param('id') id: string,
    @Body() dto: PatchDocumentDto,
  ) {
    return this.service.patchDocumentStatus(id, dto);
  }

  @Post('records/:id/decision')
  @HttpCode(HttpStatus.OK)
  submitDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitDecisionDto,
  ) {
    return this.service.submitDecision(user.id, id, dto);
  }
}
