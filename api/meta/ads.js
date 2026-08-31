const { GRAPH_URL, graphJson, tokenCookieName, unpack, parseCookies } = require('../../lib/meta-common');

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

function profileVisits(actions = []) {
  return actions.filter(action => String(action.action_type || '').includes('profile_visit'))
    .reduce((total, action) => total + (Number(action.value) || 0), 0);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = String(Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId || '');
  const accountId = String(Array.isArray(req.query.adAccountId) ? req.query.adAccountId[0] : req.query.adAccountId || '').replace(/^act_/, '').replace(/\D/g, '');
  const since = safeDate(Array.isArray(req.query.since) ? req.query.since[0] : req.query.since);
  const until = safeDate(Array.isArray(req.query.until) ? req.query.until[0] : req.query.until);
  const connection = unpack(parseCookies(req)[tokenCookieName(companyId)]);
  if (!connection?.userAccessToken || !connection.adsRead) return res.status(403).json({ error: 'Reklam okuma izni bulunamadı.' });
  if (!accountId || !since || !until) return res.status(400).json({ error: 'Reklam hesabı veya tarih aralığı eksik.' });

  try {
    const accountsUrl = new URL(`${GRAPH_URL}/me/adaccounts`);
    accountsUrl.searchParams.set('fields', 'id,account_id');
    accountsUrl.searchParams.set('limit', '100');
    accountsUrl.searchParams.set('access_token', connection.userAccessToken);
    const accountsPayload = await graphJson(accountsUrl.toString());
    const allowed = (accountsPayload.data || []).some(account => (account.account_id || String(account.id || '').replace(/^act_/, '')) === accountId);
    if (!allowed) return res.status(403).json({ error: 'Bu reklam hesabına erişim bulunamadı.' });

    const insightsUrl = new URL(`${GRAPH_URL}/act_${accountId}/insights`);
    insightsUrl.searchParams.set('fields', 'spend,impressions,reach,clicks,actions,account_currency');
    insightsUrl.searchParams.set('level', 'account');
    insightsUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
    insightsUrl.searchParams.set('limit', '10');
    insightsUrl.searchParams.set('access_token', connection.userAccessToken);
    const payload = await graphJson(insightsUrl.toString());
    const insight = payload.data?.[0] || {};
    const visits = profileVisits(insight.actions);
    return res.status(200).json({
      spend: insight.spend || '0',
      impressions: insight.impressions || '0',
      reach: insight.reach || '0',
      clicks: insight.clicks || '0',
      profileVisits: visits ? String(visits) : '',
      currency: insight.account_currency || '',
    });
  } catch (caught) {
    return res.status(502).json({ error: caught instanceof Error ? caught.message : 'Reklam verileri alınamadı.' });
  }
};
