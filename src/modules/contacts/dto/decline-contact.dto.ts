import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
