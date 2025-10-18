const WHITELIST = [
  'openfoodfacts.org',
  'openbeautyfacts.org'
];

function isWhitelisted(url: string): boolean {
  try {
    const parsed = new URL(url);
    return WHITELIST.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
  } catch (error) {
    return false;
  }
}

export async function fetch_json(url: string, headers?: Record<string, string>): Promise<any> {
  if (!isWhitelisted(url)) {
    throw new Error(`fetch_json: URL not allowed: ${url}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`fetch_json: HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('fetch_json: Response is not JSON');
    }

    return await response.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('fetch_json: Request timed out after 6s');
    }
    throw new Error(`fetch_json: ${error?.message || 'Unknown error'}`);
  } finally {
    clearTimeout(timeout);
  }
}
