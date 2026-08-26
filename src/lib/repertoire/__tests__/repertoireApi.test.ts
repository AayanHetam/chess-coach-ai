// NOT in src/pages/api/__tests__/ — anything under src/pages/api is an API
// ROUTE, so a test file there ships as an endpoint.
import { describe, expect, it } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/repertoire';

function call(query: Record<string, unknown>, method = 'GET') {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  handler({ method, query } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}

const bandOf = (res: ReturnType<typeof call>) =>
  (res.body as { meta: { band: string | null } }).meta.band;

describe('/api/repertoire', () => {
  it('serves the default corpus when no band is asked for', () => {
    const res = call({});
    expect(res.statusCode).toBe(200);
    expect(bandOf(res)).toBeNull();
  });

  it('serves a band its own corpus', () => {
    const res = call({ band: 'improving' });
    expect(res.statusCode).toBe(200);
    expect(bandOf(res)).toBe('improving');
  });

  // The cache keyspace. The response is public and keyed by URL, so an
  // unbounded band would let anyone mint unlimited distinct entries and evict
  // the six real ones. Rejected before anything is cached.
  it('refuses a band it does not know, rather than caching a response for it', () => {
    const res = call({ band: 'grandmaster' });
    expect(res.statusCode).toBe(400);
    expect(res.headers['Cache-Control']).toBeUndefined();
  });

  it('treats an empty band as no band at all', () => {
    expect(call({ band: '' }).statusCode).toBe(200);
  });

  it('treats a repeated band param as no band rather than picking one', () => {
    // `?band=new&band=club` arrives as an array. Picking either would make the
    // cached response depend on parameter order.
    const res = call({ band: ['new', 'club'] });
    expect(res.statusCode).toBe(200);
    expect(bandOf(res)).toBeNull();
  });

  it('still caches, so a band is not re-derived per visitor', () => {
    expect(call({ band: 'club' }).headers['Cache-Control']).toContain('max-age=3600');
  });

  it('allows only GET', () => {
    expect(call({}, 'POST').statusCode).toBe(405);
  });
});
