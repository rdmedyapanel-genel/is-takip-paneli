const {
  GOOGLE_ADS_SCOPE, crypto, safeCompanyId, getGoogleAdsConfig,
  cookie, seal, redirect, panelUrl,
} = require('../../lib/google-ads-common');

module.exports = async function handler(req, res) {
  const companyId = safeCompanyId(req.query.companyId);
  const config = getGoogleAdsConfig(req);
  if (!companyId) return redirect(res, panelUrl(req, { google_ads_error: 'Firma seçilmedi.' }));
  if (!config.clientId || !config.clientSecret || !config.developerToken) {
    return redirect(res, panelUrl(req, { google_ads_error: 'Google Ads ayarları Vercel üzerinde eksik.', companyId }));
  }

  const nonce = crypto.randomUUID();
  const state = `${companyId}.${nonce}`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_ADS_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  res.setHeader('Set-Cookie', cookie(req, 'rdgrup_google_ads_state', seal({ companyId, nonce }, config.clientSecret), 600));
  return redirect(res, authUrl.toString());
};
