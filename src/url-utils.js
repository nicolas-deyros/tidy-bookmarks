export function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

const TRACKING_PARAM = /^(utm_|mc_|ga_|_hs|hsa_|pk_)/i;
const TRACKING_EXACT = new Set([
  'gclid', 'fbclid', 'msclkid', 'dclid', 'yclid', 'ref', 'ref_src',
  'igshid', 'mkt_tok', 'spm', 'cmpid', 'campaign_id'
]);

// A looser key than normalizeUrl: ignores scheme, leading www, trailing slash,
// and common tracking params so the SAME page saved twice collapses to one key.
export function looseNormalizeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const kept = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAM.test(k) && !TRACKING_EXACT.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${host}${path}${qs}`;
  } catch {
    return url;
  }
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function faviconParams(pageUrl, size = 16) {
  const params = new URLSearchParams({ pageUrl, size: String(size) });
  return `/_favicon/?${params.toString()}`;
}
