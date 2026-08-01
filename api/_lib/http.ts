import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * CORS, and the preflight that comes with it.
 *
 * Normally the browser and the API share an origin and none of this matters.
 * It starts mattering the moment VITE_API_BASE_URL points somewhere else — a
 * preview deployment, a custom domain, a dev server talking to production. The
 * browser then sends an OPTIONS preflight first, because the requests carry an
 * Authorization header, and an endpoint that only knows GET/POST answers 405.
 * From the page that looks like the endpoint rejecting the real request.
 *
 * Echoing the caller's origin is safe here: every endpoint still requires a
 * bearer token or an x-api-key, and credentials are not allowed, so a hostile
 * page gains nothing it could not do from curl.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;

  res.setHeader("Access-Control-Allow-Origin", typeof origin === "string" ? origin : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/**
 * Answers a preflight. Returns true when the request was a preflight and the
 * handler should stop.
 */
export function handledPreflight(req: VercelRequest, res: VercelResponse): boolean {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}
