export function appUrl(path) {
  if (typeof path !== 'string'
    || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*(?:\?[A-Za-z0-9_.=&-]*)?$/.test(path)
    || path.split('?')[0].split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new TypeError('Application resource paths must be relative file paths.');
  }
  const appBaseUrl = new URL(import.meta.env.BASE_URL, document.baseURI);
  const resourceUrl = new URL(path, appBaseUrl);
  if (resourceUrl.origin !== appBaseUrl.origin || !resourceUrl.pathname.startsWith(appBaseUrl.pathname)) {
    throw new TypeError('Application resource paths must stay within the application base path.');
  }
  return resourceUrl.href;
}

const REQUEST_MIN_INTERVAL_MS = 350;
const REQUEST_WINDOW_MS = 10_000;
const REQUEST_WINDOW_LIMIT = 12;
const REQUEST_PENDING_LIMIT = 4;
const MAX_REQUEST_BODY_BYTES = 16_384;
const requestState = new Map();

function getRequestState(key, now) {
  const state = requestState.get(key) || { starts: [], reservedUntil: 0, pending: 0 };
  state.starts = state.starts.filter((startedAt) => now - startedAt < REQUEST_WINDOW_MS);
  requestState.set(key, state);
  return state;
}

export async function fetchApp(path, init = {}) {
  const resourceUrl = appUrl(path);
  const method = (init.method || 'GET').toUpperCase();
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(method)) {
    throw new TypeError('Unsupported application request method.');
  }
  if (init.body !== undefined) {
    if (typeof init.body !== 'string' || new TextEncoder().encode(init.body).byteLength > MAX_REQUEST_BODY_BYTES) {
      throw new TypeError('Application request payload is invalid or too large.');
    }
  }

  const key = `${method}:${new URL(resourceUrl).pathname}`;
  const now = Date.now();
  const state = getRequestState(key, now);
  if (state.pending >= REQUEST_PENDING_LIMIT || state.starts.length >= REQUEST_WINDOW_LIMIT) {
    throw new Error('تم تجاوز عدد الطلبات المسموح مؤقتاً. انتظر قليلاً ثم حاول مجدداً.');
  }

  state.pending += 1;
  try {
    const scheduledAt = Math.max(Date.now(), state.reservedUntil);
    state.reservedUntil = scheduledAt + REQUEST_MIN_INTERVAL_MS;
    const delay = Math.max(0, scheduledAt - Date.now());
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    if (init.signal?.aborted) throw new DOMException('Request was aborted.', 'AbortError');
    const startedAt = Date.now();
    if (state.starts.filter((time) => startedAt - time < REQUEST_WINDOW_MS).length >= REQUEST_WINDOW_LIMIT) {
      throw new Error('تم تجاوز عدد الطلبات المسموح مؤقتاً. انتظر قليلاً ثم حاول مجدداً.');
    }
    state.starts.push(startedAt);
    return await fetch(resourceUrl, init);
  } finally {
    state.pending -= 1;
  }
}
