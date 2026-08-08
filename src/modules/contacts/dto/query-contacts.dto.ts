import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ContactStatus } from '@prisma/client';

export class QueryContactsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['sent', 'received'])
  direction?: 'sent' | 'received';

  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;
}
