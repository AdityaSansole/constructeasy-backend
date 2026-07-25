import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { CountriesService } from './countries.service';
import { applyEtag } from '../../../common/utils/etag.util';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.countriesService.findAll();
    if (applyEtag(req, res, data)) return;
    return data;
  }
}
