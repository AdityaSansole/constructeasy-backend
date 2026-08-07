import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CoverageTypeDto {
  LOCALITY = 'locality',
  RADIUS = 'radius',
}

/**
 * CreateServiceAreaDto — cross-field validation per spec Section 6:
 * - radiusKm required and > 0 when coverageType = radius
 * - radiusKm must be absent/omitted when coverageType = locality
 */
export class CreateServiceAreaDto {
  @IsUUID()
  localityId!: string;

  @IsEnum(CoverageTypeDto)
  coverageType!: CoverageTypeDto;

  @ValidateIf((o: CreateServiceAreaDto) => o.coverageType === CoverageTypeDto.RADIUS)
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  radiusKm?: number;
}
