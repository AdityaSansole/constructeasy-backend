import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Shared pagination query DTO — Sign-Off Section 7.5.
 * `page` default 1, `page_size` default 20, max 100.
 * Every list endpoint across every module extends/uses this — never
 * reimplemented per-module (Phase 3 Plan Section 7 / 17, rule 7).
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 20;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Builds the { skip, take } args for a Prisma `findMany` call, and a
 * companion function to assemble the final Paginated<T> result once both
 * the page of rows and the total count are known.
 *
 * Usage (illustrative — no Prisma models exist yet in Batch 0):
 *
 *   const { skip, take } = toPrismaPagination(query);
 *   const [items, total_count] = await Promise.all([
 *     prisma.someTable.findMany({ skip, take, where, orderBy }),
 *     prisma.someTable.count({ where }),
 *   ]);
 *   return buildPaginatedResult(items, total_count, query);
 *
 * This pattern is the enforcement point for Sign-Off Section 20, Rule 5 —
 * "all list endpoints paginate at the database layer; no unbounded
 * in-memory fetches" — LIMIT/OFFSET always applied before serialization.
 */
export function toPrismaPagination(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 20;
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPaginatedResult<T>(
  items: T[],
  totalCount: number,
  query: PaginationQueryDto,
): Paginated<T> {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 20;
  return {
    items,
    meta: {
      page,
      page_size: pageSize,
      total_count: totalCount,
      total_pages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  };
}
