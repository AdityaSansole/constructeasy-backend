import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class SearchProjectsDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  override page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  override page_size: number = 20;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  projectType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  completionYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxCost?: number;

  @IsOptional()
  @IsString()
  localityId?: string;

  @IsOptional()
  @IsString()
  category?: string; // category slug
}
