const crypto = require('crypto');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

function first(value) {
  return Array.isArray(value) ? value[0] : String(value || '');
}

function requestOrigin(req) {
  const proto = first(req.headers['x-forwarded-proto']) || 'https';
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
  return `${proto}://${host}`;
}

function getMetaConfig(req) {
  return {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    redirectUri: process.env.META_REDIRECT_URI || `${requestOrigin(req)}/api/meta/callback`,
  };
}

function safeCompanyId(value) {
  return first(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function tokenCookieName(companyId) {
  return `rdgrup_meta_${safeCompanyId(companyId)}`;
}

function pendingCookieName(companyId) {
  return `rdgrup_meta_pending_${safeCompanyId(companyId)}`;
}

function pack(value) {
  return encodeURIComponent(JSON.stringify(value));
}

function unpack(value) {
  if (!value) return null;
  try { return JSON.parse(decodeURIComponent(value)); } catch (_) { return null; }
}

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((all, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return all;
    all[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
    return all;
  }, {});
}

function cookie(req, name, value, maxAge) {
  const secure = (first(req.headers['x-forwarded-proto']) || 'https') === 'https' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Number(maxAge) || 0)}${secure}`;
}

function redirect(res, target) {
  res.statusCode = 302;
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function imageProxyPath(source) {
  const value = String(source || '');
  const secret = process.env.META_APP_SECRET || '';
  if (!value || !secret) return value;
  const encoded = Buffer.from(value, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
  return `/api/meta/image-proxy?src=${encoded}&sig=${signature}`;
}

function panelUrl(req, params = {}) {
  const target = new URL('/medya/index.html', requestOrigin(req));
  target.searchParams.set('view', 'reports');
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  return target.toString();
}

async function graphJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok || body.error) {
    const message = body?.error?.message || `Meta API hatası (${response.status})`;
    throw new Error(message);
  }
  return body;
}

async function instagramCandidates(userAccessToken) {
  const pagesUrl = new URL(`${GRAPH_URL}/me/accounts`);
  pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}');
  pagesUrl.searchParams.set('limit', '100');
  pagesUrl.searchParams.set('access_token', userAccessToken);
  const pages = await graphJson(pagesUrl.toString());
  const allPages = [...(pages.data || [])];
  try {
    const businessesUrl = new URL(`${GRAPH_URL}/me/businesses`);
    businessesUrl.searchParams.set('fields', 'id,name');
    businessesUrl.searchParams.set('limit', '100');
    businessesUrl.searchParams.set('access_token', userAccessToken);
    const businesses = await graphJson(businessesUrl.toString());
    const portfolioLists = await Promise.all((businesses.data || []).flatMap(business => ['owned_pages', 'client_pages'].map(async edge => {
      try {
        const url = new URL(`${GRAPH_URL}/${business.id}/${edge}`);
        url.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}');
        url.searchParams.set('limit', '100');
        url.searchParams.set('access_token', userAccessToken);
        return (await graphJson(url.toString())).data || [];
      } catch (_) { return []; }
    })));
    portfolioLists.forEach(list => allPages.push(...list));
  } catch (_) {}

  const uniquePages = new Map();
  allPages.forEach(page => {
    const current = uniquePages.get(page.id) || {};
    uniquePages.set(page.id, {
      ...current,
      ...page,
      access_token: page.access_token || current.access_token || '',
      instagram_business_account: page.instagram_business_account || current.instagram_business_account || null,
    });
  });

  const resolvedPages = await Promise.all([...uniquePages.values()].map(async page => {
    if (page.access_token && page.instagram_business_account?.id) return page;
    try {
      const detailsUrl = new URL(`${GRAPH_URL}/${page.id}`);
      detailsUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}');
      detailsUrl.searchParams.set('access_token', userAccessToken);
      return { ...page, ...(await graphJson(detailsUrl.toString())) };
    } catch (_) { return page; }
  }));

  return Promise.all(resolvedPages.filter(item => item.instagram_business_account?.id && item.access_token).map(async item => {
    let username = item.instagram_business_account.username || '';
    if (!username) {
      try {
        const profileUrl = new URL(`${GRAPH_URL}/${item.instagram_business_account.id}`);
        profileUrl.searchParams.set('fields', 'username');
        profileUrl.searchParams.set('access_token', item.access_token);
        username = (await graphJson(profileUrl.toString())).username || '';
      } catch (_) {}
    }
    return {
      pageId: item.id,
      pageName: item.name || '',
      accessToken: item.access_token,
      igUserId: item.instagram_business_account.id,
      username,
    };
  }));
}

module.exports = {
  GRAPH_VERSION, GRAPH_URL, crypto, first, getMetaConfig, safeCompanyId,
  tokenCookieName, pendingCookieName, pack, unpack, parseCookies, cookie, redirect, panelUrl, imageProxyPath, graphJson, instagramCandidates,
};
