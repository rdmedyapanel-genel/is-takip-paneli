const {
  GRAPH_URL, getMetaConfig, graphJson, pack, unpack, parseCookies,
  tokenCookieName, pendingCookieName, cookie, redirect, panelUrl, instagramCandidates,
} = require('../../lib/meta-common');

module.exports = async function handler(req, res) {
  const error = Array.isArray(req.query.error) ? req.query.error[0] : req.query.error;
  if (error) return redirect(res, panelUrl(req, { meta_error: error }));

  const code = Array.isArray(req.query.code) ? req.query.code[0] : String(req.query.code || '');
  const state = Array.isArray(req.query.state) ? req.query.state[0] : String(req.query.state || '');
  const stored = unpack(parseCookies(req).rdgrup_meta_state);
  if (!stored || state !== `${stored.companyId}.${stored.nonce}` || !code) {
    return redirect(res, panelUrl(req, { meta_error: 'Meta güvenlik doğrulaması başarısız.' }));
  }

  try {
    const { appId, appSecret, redirectUri } = getMetaConfig(req);
    const tokenUrl = new URL(`${GRAPH_URL}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);
    const shortToken = await graphJson(tokenUrl.toString());

    const longUrl = new URL(`${GRAPH_URL}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', appId);
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('fb_exchange_token', shortToken.access_token);
    const longToken = await graphJson(longUrl.toString());

    const permissionsUrl = new URL(`${GRAPH_URL}/me/permissions`);
    permissionsUrl.searchParams.set('access_token', longToken.access_token);
    const permissions = await graphJson(permissionsUrl.toString());
    const adsRead = (permissions.data || []).some(item => item.permission === 'ads_read' && item.status === 'granted');
    const insightsRead = (permissions.data || []).some(item => item.permission === 'instagram_manage_insights' && item.status === 'granted');
    const businessManagement = (permissions.data || []).some(item => item.permission === 'business_management' && item.status === 'granted');

    const candidates = await instagramCandidates(longToken.access_token);
    const selected = candidates.find(item => item.username?.toLowerCase() === stored.expectedUsername)
      || (!stored.expectedUsername && candidates.length === 1 ? candidates[0] : null);
    if (!selected && candidates.length) {
      const maxAge = Math.min(Number(longToken.expires_in) || 5184000, 5184000);
      res.setHeader('Set-Cookie', [
        cookie(req, pendingCookieName(stored.companyId), pack({ userAccessToken: longToken.access_token, adsRead, insightsRead, businessManagement, maxAge }), 600),
        cookie(req, 'rdgrup_meta_state', '', 0),
      ]);
      return redirect(res, panelUrl(req, { meta_choose: '1', companyId: stored.companyId }));
    }
    if (!selected?.igUserId || !selected.accessToken) return redirect(res, panelUrl(req, { meta_error: 'Bağlanabilecek profesyonel Instagram hesabı bulunamadı.', companyId: stored.companyId }));

    const connection = {
      accessToken: selected.accessToken,
      userAccessToken: longToken.access_token,
      pageId: selected.pageId,
      pageName: selected.pageName || '',
      igUserId: selected.igUserId,
      username: selected.username || '',
      adsRead,
      insightsRead,
      businessManagement,
    };
    const maxAge = Math.min(Number(longToken.expires_in) || 5184000, 5184000);
    res.setHeader('Set-Cookie', [
      cookie(req, tokenCookieName(stored.companyId), pack(connection), maxAge),
      cookie(req, 'rdgrup_meta_state', '', 0),
    ]);
    return redirect(res, panelUrl(req, {
      meta_connected: '1', companyId: stored.companyId, pageId: connection.pageId,
      igUserId: connection.igUserId, username: connection.username, adsRead: adsRead ? '1' : '0', insightsRead: insightsRead ? '1' : '0',
    }));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Meta bağlantısı tamamlanamadı.';
    return redirect(res, panelUrl(req, { meta_error: message.slice(0, 160), companyId: stored.companyId }));
  }
};
