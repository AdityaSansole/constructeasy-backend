import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * UpdateHomeownerProfileDto — PATCH semantics.
 * All fields optional. localityId accepts null to clear (clearable per spec Section 6).
 */
export class UpdateHomeownerProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsUUID()
  localityId?: string | null;
}
