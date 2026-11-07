/**
 * fetch over the Rust http_request command, which has no CORS. Responses are buffered whole (no
 * streaming), which is all main/ needs: JSON APIs and small downloads.
 */
import {sys} from '../sys';
import {fromBase64, toBase64} from './bytes';

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

const NO_BODY_STATUS = new Set([101, 204, 205, 304]);

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

export const isRemoteUrl = (input: RequestInfo | URL): boolean => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return /^https?:\/\//i.test(url);
};

export async function httpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  if (request.signal.aborted) throw abortError();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name] = value;
  });

  const payload: Record<string, unknown> = {url: request.url, method: request.method, headers};
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (typeof init?.body === 'string') {
      payload.body = init.body;
    } else {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > 0) payload.bodyBase64 = toBase64(bytes);
    }
  }

  const aborted = new Promise<never>((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(abortError()), {once: true});
  });
  const reply = await Promise.race([sys('http_request', {request: payload}) as Promise<HttpResponse>, aborted]);

  const body = NO_BODY_STATUS.has(reply.status) ? null : fromBase64(reply.bodyBase64 ?? '');
  const response = new Response(body as BodyInit | null, {
    status: reply.status,
    statusText: reply.statusText,
    headers: reply.headers
  });
  Object.defineProperty(response, 'url', {value: request.url});
  return response;
}

/** Remote http(s) URLs go through Rust; everything else (blob:, data:, same-origin files) uses the platform's fetch. */
export const installFetch = () => {
  const platformFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => (
    isRemoteUrl(input) ? httpFetch(input, init) : platformFetch(input, init)
  )) as typeof fetch;
};
