import { Module } from '@nestjs/common';
import { LocalesController } from './locales/locales.controller';
import { LocalesService } from './locales/locales.service';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';

@Module({
  controllers: [LocalesController, RolesController],
  providers: [LocalesService, RolesService],
})
export class LookupsModule {}
