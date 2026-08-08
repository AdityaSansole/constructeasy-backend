import { DocumentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PatchDocumentDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  rejectionReason?: string;
}
