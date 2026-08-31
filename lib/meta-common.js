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

module.exports = {
  GRAPH_VERSION, GRAPH_URL, crypto, first, getMetaConfig, safeCompanyId,
  tokenCookieName, pack, unpack, parseCookies, cookie, redirect, panelUrl, graphJson,
};
