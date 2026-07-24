import { buildIdSlug, parseIdSlug, slugify } from '../../src/common/utils/slug.util';

describe('slug.util', () => {
  describe('slugify', () => {
    it('lowercases and hyphenates', () => {
      expect(slugify('Sharma Interiors Pune')).toBe('sharma-interiors-pune');
    });

    it('strips diacritics and non-alphanumeric characters', () => {
      expect(slugify('Café & Co. — Renovation!')).toBe('cafe-co-renovation');
    });

    it('trims leading/trailing hyphens', () => {
      expect(slugify('  --Hello World--  ')).toBe('hello-world');
    });
  });

  describe('buildIdSlug / parseIdSlug round trip', () => {
    const id = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890'; // 36 chars
    const slug = 'sharma-interiors-pune';

    it('builds the canonical {uuid}-{slug} form', () => {
      expect(buildIdSlug(id, slug)).toBe(`${id}-${slug}`);
    });

    it('parses the UUID deterministically as the first 36 characters', () => {
      const parsed = parseIdSlug(`${id}-${slug}`);
      expect(parsed.id).toBe(id);
      expect(parsed.slug).toBe(slug);
    });

    it('parses correctly even if the slug is stale/mismatched', () => {
      const parsed = parseIdSlug(`${id}-totally-different-slug`);
      expect(parsed.id).toBe(id);
      expect(parsed.slug).toBe('totally-different-slug');
    });

    it('handles an id with no trailing slug', () => {
      const parsed = parseIdSlug(id);
      expect(parsed.id).toBe(id);
      expect(parsed.slug).toBe('');
    });
  });
});
