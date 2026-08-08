import { VerificationStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitDecisionDto {
  @IsEnum(VerificationStatus)
  targetStatus!: VerificationStatus;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reviewerNotes?: string;
}
