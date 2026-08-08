import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  professionalId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  localityId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetInr?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  timeline?: string;
}
