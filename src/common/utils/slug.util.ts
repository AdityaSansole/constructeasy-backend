/**
 * Shared slug utilities — used by professional_profiles (API Design Batch 1,
 * amendment 1) and content_articles (API Design Batch 5), both of which use
 * the canonical `{uuid}-{slug}` public URL pattern.
 *
 * Built once here (Batch 0) per Phase 3 Plan Section 7; consumed by the
 * Profiles module (Batch 3) and Content module (Batch 11) — not
 * reimplemented per-module.
 */

const UUID_LENGTH = 36; // canonical string form, fixed length

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80); // keep URLs reasonable
}

export function buildIdSlug(id: string, slug: string): string {
  return `${id}-${slug}`;
}

/**
 * Parses a `{uuid}-{slug}` route param deterministically: the UUID is
 * always the first 36 characters; anything after the following hyphen is
 * the (possibly stale) slug. No regex guessing — matches the justification
 * given in API Design Batch 1, amendment 1.
 */
export function parseIdSlug(idSlug: string): { id: string; slug: string } {
  const id = idSlug.slice(0, UUID_LENGTH);
  const rest = idSlug.slice(UUID_LENGTH); // e.g. "-sharma-interiors-pune"
  const slug = rest.startsWith('-') ? rest.slice(1) : rest;
  return { id, slug };
}
