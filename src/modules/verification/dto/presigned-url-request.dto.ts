import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class PresignedUrlRequestDto {
  @IsString()
  @IsNotEmpty()
  originalFilename!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['application/pdf', 'image/jpeg', 'image/png'])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10000000)
  fileSize!: number;
}
