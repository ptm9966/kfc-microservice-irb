function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getHttpOrigin(value) {
  if (!value) return null;

  try {
    const origin = new URL(value);
    if (
      origin.protocol !== 'http:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      return null;
    }

    return origin;
  } catch {
    return null;
  }
}

export function createHttpServiceProxy({ envKey, serviceName, stripPrefix = '' }) {
  return async function onRequest({ request, env }) {
    const origin = getHttpOrigin(env[envKey]);
    if (!origin) {
      return jsonResponse({ message: `${serviceName} service proxy is not configured` }, 503);
    }

    const requestUrl = new URL(request.url);
    let upstreamPath = requestUrl.pathname;
    if (stripPrefix) {
      const suffix = requestUrl.pathname.slice(stripPrefix.length);
      upstreamPath = `/${suffix.replace(/^\/+/, '')}`;
    }

    origin.pathname = upstreamPath || '/';
    origin.search = requestUrl.search;

    try {
      const requestForOrigin = new Request(origin, request);
      const requestHeaders = new Headers(requestForOrigin.headers);
      requestHeaders.delete('host');

      const upstreamResponse = await fetch(
        new Request(requestForOrigin, { headers: requestHeaders }),
      );
      const headers = new Headers(upstreamResponse.headers);
      headers.set('Cache-Control', 'no-store');

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
      });
    } catch (error) {
      console.error(`${serviceName} service proxy request failed:`, error);
      return jsonResponse({ message: `${serviceName} service is unavailable` }, 502);
    }
  };
}
