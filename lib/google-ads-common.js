const crypto = require('crypto');

const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function first(value) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function requestOrigin(req) {
  const proto = first(req.headers['x-forwarded-proto']) || 'https';
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
  return `${proto}://${host}`;
}

function safeCompanyId(value) {
  return first(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function safeCustomerId(value) {
  return first(value).replace(/\D/g, '').slice(0, 20);
}

function getGoogleAdsConfig(req) {
  const apiVersion = /^v\d+$/.test(process.env.GOOGLE_ADS_API_VERSION || '') ? process.env.GOOGLE_ADS_API_VERSION : 'v25';
  return {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    redirectUri: process.env.GOOGLE_ADS_REDIRECT_URI || `${requestOrigin(req)}/api/google-ads/callback`,
    apiVersion,
  };
}

function tokenCookieName(companyId) {
  return `rdgrup_google_ads_${safeCompanyId(companyId)}`;
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

function encryptionKey(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest();
}

function seal(value, secret) {
  if (!secret) throw new Error('Google OAuth istemci gizli anahtarı eksik.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString('base64url')).join('.');
}

function unseal(value, secret) {
  try {
    const [ivText, tagText, encryptedText] = String(value || '').split('.');
    if (!ivText || !tagText || !encryptedText || !secret) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (_) { return null; }
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

async function jsonResponse(response, fallbackMessage) {
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!response.ok || body.error) {
    const details = body?.error?.details?.find(item => item?.errors?.length)?.errors?.[0];
    const message = details?.message || body?.error?.message || body?.error_description || fallbackMessage || `Google API hatası (${response.status})`;
    throw Object.assign(new Error(message), { status: response.status, body });
  }
  return body;
}

async function refreshAccessToken(connection, config) {
  if (!connection?.refreshToken) throw Object.assign(new Error('Google Ads bağlantısı bulunamadı.'), { status: 401 });
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const token = await jsonResponse(response, 'Google erişim anahtarı yenilenemedi.');
  if (!token.access_token) throw new Error('Google erişim anahtarı alınamadı.');
  return token.access_token;
}

function connectionFromRequest(req, companyId, config) {
  const packed = parseCookies(req)[tokenCookieName(companyId)];
  return unseal(packed, config.clientSecret);
}

function adsHeaders(accessToken, config, loginCustomerId = '') {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'developer-token': config.developerToken,
  };
  const loginId = safeCustomerId(loginCustomerId);
  if (loginId) headers['login-customer-id'] = loginId;
  return headers;
}

async function listAccessibleCustomers(accessToken, config) {
  const url = `https://googleads.googleapis.com/${config.apiVersion}/customers:listAccessibleCustomers`;
  const response = await fetch(url, { headers: adsHeaders(accessToken, config) });
  return jsonResponse(response, 'Google Ads hesapları alınamadı.');
}

async function searchStream(accessToken, config, customerId, loginCustomerId, query) {
  const id = safeCustomerId(customerId);
  if (!id) throw new Error('Google Ads müşteri numarası geçersiz.');
  const url = `https://googleads.googleapis.com/${config.apiVersion}/customers/${id}/googleAds:searchStream`;
  const response = await fetch(url, {
    method: 'POST',
    headers: adsHeaders(accessToken, config, loginCustomerId),
    body: JSON.stringify({ query }),
  });
  const payload = await jsonResponse(response, 'Google Ads raporu alınamadı.');
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap(batch => Array.isArray(batch?.results) ? batch.results : []);
}

module.exports = {
  GOOGLE_ADS_SCOPE, TOKEN_URL, crypto, first, requestOrigin, safeCompanyId, safeCustomerId,
  getGoogleAdsConfig, tokenCookieName, parseCookies, cookie, seal, unseal, redirect, panelUrl,
  jsonResponse, refreshAccessToken, connectionFromRequest, listAccessibleCustomers, searchStream,
};
