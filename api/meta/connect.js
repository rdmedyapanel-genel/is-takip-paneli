const {
  GRAPH_VERSION, crypto, first, getMetaConfig, safeCompanyId,
  pack, cookie, redirect, panelUrl,
} = require('../../lib/meta-common');

module.exports = async function handler(req, res) {
  const companyId = safeCompanyId(req.query.companyId);
  const rawUsername = first(req.query.expectedUsername).trim();
  let expectedUsername = rawUsername;
  try { if (/^https?:\/\//i.test(rawUsername)) expectedUsername = new URL(rawUsername).pathname.split('/').filter(Boolean)[0] || ''; }
  catch (_) {}
  expectedUsername = expectedUsername.replace(/^@/, '').split(/[/?#]/)[0].toLowerCase().replace(/[^a-z0-9._]/g, '');
  const { appId, appSecret, redirectUri } = getMetaConfig(req);
  if (!companyId) return redirect(res, panelUrl(req, { meta_error: 'Firma seçilmedi.' }));
  if (!appId || !appSecret) return redirect(res, panelUrl(req, { meta_error: 'Meta ayarları Vercel üzerinde eksik.', companyId }));

  const nonce = crypto.randomUUID();
  const state = `${companyId}.${nonce}`;
  const authUrl = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,ads_read');
  authUrl.searchParams.set('auth_type', 'rerequest');
  res.setHeader('Set-Cookie', cookie(req, 'rdgrup_meta_state', pack({ companyId, nonce, expectedUsername }), 600));
  return redirect(res, authUrl.toString());
};
