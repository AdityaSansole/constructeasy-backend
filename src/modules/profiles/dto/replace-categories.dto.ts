import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
} from 'class-validator';

/**
 * ReplaceCategoriesDto — full-replace semantics per spec Section 3.
 * 1–4 items, no duplicates enforced at the service layer.
 */
export class ReplaceCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsUUID('4', { each: true })
  categoryIds!: string[];
}
