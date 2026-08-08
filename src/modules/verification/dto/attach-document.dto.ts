import { DocumentType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AttachDocumentDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @IsString()
  @IsNotEmpty()
  originalFilename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10000000)
  fileSize!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksum?: string;
}
