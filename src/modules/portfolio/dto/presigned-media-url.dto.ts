import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class PresignedMediaUrlDto {
  @IsString()
  @IsNotEmpty()
  originalFilename!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10485760) // 10 MB limit (10 * 1024 * 1024 bytes)
  fileSize!: number;
}
