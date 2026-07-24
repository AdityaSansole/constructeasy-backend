import { computeEtag } from '../../src/common/utils/etag.util';

describe('etag.util', () => {
  it('produces the same ETag for identical payloads', () => {
    const a = computeEtag({ id: 1, name: 'Maharashtra' });
    const b = computeEtag({ id: 1, name: 'Maharashtra' });
    expect(a).toBe(b);
  });

  it('produces different ETags for different payloads', () => {
    const a = computeEtag({ id: 1, name: 'Maharashtra' });
    const b = computeEtag({ id: 2, name: 'Karnataka' });
    expect(a).not.toBe(b);
  });

  it('wraps the hash in quotes per the ETag header convention', () => {
    const tag = computeEtag({ x: 1 });
    expect(tag.startsWith('"')).toBe(true);
    expect(tag.endsWith('"')).toBe(true);
  });
});
