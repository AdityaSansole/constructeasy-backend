import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { LocalesService } from './locales.service';
import { applyEtag } from '../../../common/utils/etag.util';

@Controller('locales')
export class LocalesController {
  constructor(private readonly localesService: LocalesService) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.localesService.findAll();
    if (applyEtag(req, res, data)) return;
    return data;
  }
}
