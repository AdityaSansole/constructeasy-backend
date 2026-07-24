import {
  buildPaginatedResult,
  toPrismaPagination,
} from '../../src/common/dto/pagination.dto';

describe('pagination.dto', () => {
  describe('toPrismaPagination', () => {
    it('computes skip/take for page 1', () => {
      expect(toPrismaPagination({ page: 1, page_size: 20 })).toEqual({
        skip: 0,
        take: 20,
      });
    });

    it('computes skip/take for page 3', () => {
      expect(toPrismaPagination({ page: 3, page_size: 10 })).toEqual({
        skip: 20,
        take: 10,
      });
    });
  });

  describe('buildPaginatedResult', () => {
    it('computes total_pages correctly, rounding up', () => {
      const result = buildPaginatedResult([1, 2], 45, {
        page: 1,
        page_size: 20,
      });
      expect(result.meta).toEqual({
        page: 1,
        page_size: 20,
        total_count: 45,
        total_pages: 3,
      });
    });

    it('never returns fewer than 1 total_pages, even with zero results', () => {
      const result = buildPaginatedResult([], 0, { page: 1, page_size: 20 });
      expect(result.meta.total_pages).toBe(1);
    });
  });
});
