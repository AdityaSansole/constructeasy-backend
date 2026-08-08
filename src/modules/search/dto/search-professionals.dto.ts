import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { VerificationLevel } from '@prisma/client';

export enum ProfessionalSortOption {
  Trust = 'trust',
  Rating = 'rating',
  Projects = 'projects',
  Newest = 'newest',
}

export class SearchProfessionalsDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  override page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  override page_size: number = 20;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  category?: string; // category slug

  @IsOptional()
  @IsString()
  city?: string; // city slug

  @IsOptional()
  @IsString()
  localityId?: string;

  @IsOptional()
  @IsEnum(VerificationLevel)
  verificationLevel?: VerificationLevel;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minProjects?: number;

  @IsOptional()
  @IsIn(['trust', 'rating', 'projects', 'newest'])
  sort?: ProfessionalSortOption = ProfessionalSortOption.Trust;
}
