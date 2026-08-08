import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CompareProfessionalsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return value;
  })
  identifiers!: string[]; // Array of 2 to 4 distinct IDs or slugs
}
