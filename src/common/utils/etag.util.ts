import { createHash } from 'crypto';
import { Request, Response } from 'express';

/**
 * Shared ETag / If-None-Match utility — Sign-Off Section 8, applied to all
 * rarely-changing public lookup endpoints (countries, states, cities,
 * localities, locales, professional-categories, subscription-plans,
 * content-article details).
 *
 * Usage in a controller method:
 *
 *   @Get()
 *   async list(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
 *     const data = await this.service.findAll();
 *     if (applyEtag(req, res, data)) return; // 304 already sent
 *     return data;
 *   }
 *
 * Returns true if a 304 was sent (caller should return without a body).
 */
export function computeEtag(payload: unknown): string {
  const hash = createHash('sha1')
    .update(JSON.stringify(payload))
    .digest('hex');
  return `"${hash}"`;
}

export function applyEtag(
  req: Request,
  res: Response,
  payload: unknown,
): boolean {
  const etag = computeEtag(payload);
  res.setHeader('ETag', etag);

  const ifNoneMatch = req.header('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}
