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
import { Throttle } from '@nestjs/throttler';
import {
  AuthenticatedUser,
  ClerkAuthGuard,
} from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { DeclineContactDto } from './dto/decline-contact.dto';

@Controller('contacts')
@UseGuards(ClerkAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests per hour
  createContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.createContact(user.id, user.roles, dto);
  }

  @Get()
  listContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryContactsDto,
  ) {
    return this.contactsService.listContacts(user.id, query);
  }

  @Get(':id')
  getContactDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.contactsService.getContactDetail(user.id, id);
  }

  @Patch(':id/accept')
  acceptContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.contactsService.acceptContact(user.id, id);
  }

  @Patch(':id/decline')
  declineContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DeclineContactDto,
  ) {
    return this.contactsService.declineContact(user.id, id, dto);
  }

  @Patch(':id/cancel')
  cancelContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.contactsService.cancelContact(user.id, id);
  }

  @Patch(':id/archive')
  archiveContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.contactsService.archiveContact(user.id, id);
  }
}
