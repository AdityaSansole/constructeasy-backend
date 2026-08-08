import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  ClerkAuthGuard,
} from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VerificationService } from './verification.service';
import { PresignedUrlRequestDto } from './dto/presigned-url-request.dto';
import { AttachDocumentDto } from './dto/attach-document.dto';

@Controller('verification/me')
@UseGuards(ClerkAuthGuard)
export class VerificationController {
  constructor(private readonly service: VerificationService) {}

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  createApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.service.createApplication(user.id, user.roles);
  }

  @Get('applications/active')
  getActiveApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getActiveApplication(user.id);
  }

  @Get('applications')
  listApplicationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.service.listApplicationHistory(user.id, pageNum, limitNum);
  }

  @Post('applications/active/documents/presigned-url')
  @HttpCode(HttpStatus.CREATED)
  getPresignedUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignedUrlRequestDto,
  ) {
    return this.service.getPresignedUploadUrl(user.id, dto);
  }

  @Post('applications/active/documents')
  @HttpCode(HttpStatus.CREATED)
  attachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AttachDocumentDto,
  ) {
    return this.service.attachDocument(user.id, dto);
  }

  @Delete('applications/active/documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.deleteDocument(user.id, id);
  }

  @Post('applications/active/submit')
  @HttpCode(HttpStatus.OK)
  submitApplication(@CurrentUser() user: AuthenticatedUser) {
    return this.service.submitApplication(user.id);
  }
}
