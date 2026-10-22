type SiteEnvironment = Readonly<Record<string, string | undefined>>;

export function siteOrigin(env: SiteEnvironment = process.env) {
  const value = env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3005';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be a website origin without credentials, path, query or fragment.');
  }
  return url.origin;
}

export function publicHttpsOrigin(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash
      && host.includes('.') && !host.includes(':') && !/^\d+(?:\.\d+){3}$/.test(host)
      && !/(^|\.)(localhost|local|test|invalid|example|example\.com|example\.org|example\.net)$/.test(host);
  } catch { return false; }
}

export function indexingEnabled(env: SiteEnvironment = process.env) {
  return env.SITE_INDEXING_ENABLED === 'true' && env.SITE_CONTENT_APPROVED === 'true'
    && env.NODE_ENV === 'production' && (!env.VERCEL_ENV || env.VERCEL_ENV === 'production')
    && publicHttpsOrigin(env.NEXT_PUBLIC_SITE_URL || '');
}
