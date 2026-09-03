const {
  TOKEN_URL, first, getGoogleAdsConfig, parseCookies, tokenCookieName,
  cookie, seal, unseal, jsonResponse, redirect, panelUrl,
} = require('../../lib/google-ads-common');

module.exports = async function handler(req, res) {
  const config = getGoogleAdsConfig(req);
  const error = first(req.query.error);
  const stored = unseal(parseCookies(req).rdgrup_google_ads_state, config.clientSecret);
  if (error) return redirect(res, panelUrl(req, { google_ads_error: error, companyId: stored?.companyId || '' }));

  const code = first(req.query.code);
  const state = first(req.query.state);
  if (!stored || state !== `${stored.companyId}.${stored.nonce}` || !code) {
    return redirect(res, panelUrl(req, { google_ads_error: 'Google Ads güvenlik doğrulaması başarısız.', companyId: stored?.companyId || '' }));
  }

  try {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    });
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const token = await jsonResponse(response, 'Google Ads bağlantısı tamamlanamadı.');
    if (!token.refresh_token) throw new Error('Google yenileme anahtarı alınamadı. Bağlantıyı kaldırıp yeniden izin verin.');
    const connection = { refreshToken: token.refresh_token, scope: token.scope || '', connectedAt: new Date().toISOString() };
    res.setHeader('Set-Cookie', [
      cookie(req, tokenCookieName(stored.companyId), seal(connection, config.clientSecret), 180 * 24 * 60 * 60),
      cookie(req, 'rdgrup_google_ads_state', '', 0),
    ]);
    return redirect(res, panelUrl(req, { google_ads_choose: '1', companyId: stored.companyId }));
  } catch (caught) {
    return redirect(res, panelUrl(req, {
      google_ads_error: (caught instanceof Error ? caught.message : 'Google Ads bağlantısı tamamlanamadı.').slice(0, 180),
      companyId: stored.companyId,
    }));
  }
};
