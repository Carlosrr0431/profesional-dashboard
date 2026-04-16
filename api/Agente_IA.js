import { GET, POST } from '../src/app/api/Agente_IA/route.js';

function toRequest(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost';
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) headers.set(key, value.join(','));
    else if (value != null) headers.set(key, String(value));
  }

  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = req.body == null
      ? '{}'
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    init.body = body;
  }

  return new Request(url, init);
}

async function sendResponse(response, res) {
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (contentType.includes('application/json')) {
    try {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(text);
      return;
    } catch {
      // Fallback to plain text below.
    }
  }

  res.end(text);
}

export default async function handler(req, res) {
  try {
    console.info('[agente-ia-api]', JSON.stringify({ stage: 'request', method: req.method, path: req.url }));
    const request = toRequest(req);

    let response;
    if (req.method === 'POST') {
      response = await POST(request);
    } else if (req.method === 'GET') {
      response = await GET(request);
    } else {
      response = Response.json({ success: false, error: 'Method Not Allowed' }, { status: 405 });
    }

    console.info('[agente-ia-api]', JSON.stringify({ stage: 'response', method: req.method, path: req.url, status: response.status }));
    await sendResponse(response, res);
  } catch (error) {
    console.error('[agente-ia-api]', JSON.stringify({ stage: 'error', method: req.method, path: req.url, error: error?.message || 'Internal Server Error' }));
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, error: error?.message || 'Internal Server Error' }));
  }
}
