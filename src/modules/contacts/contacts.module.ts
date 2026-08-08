import { Module } from '@nestjs/common';
import { ClerkModule } from '../../infrastructure/clerk/clerk.module';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';

@Module({
  imports: [ClerkModule],
  controllers: [ContactsController],
  providers: [ContactsService, ClerkAuthGuard],
  exports: [ContactsService],
})
export class ContactsModule {}
