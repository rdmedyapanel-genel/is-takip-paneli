const { GRAPH_URL, graphJson, tokenCookieName, unpack, parseCookies } = require('../../lib/meta-common');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = String(Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId || '');
  const connection = unpack(parseCookies(req)[tokenCookieName(companyId)]);
  if (!connection?.userAccessToken || !connection.adsRead) return res.status(403).json({ error: 'Reklam verileri için Meta reklam izni bulunamadı.' });

  try {
    const url = new URL(`${GRAPH_URL}/me/adaccounts`);
    url.searchParams.set('fields', 'id,account_id,name,currency,timezone_name,account_status');
    url.searchParams.set('limit', '100');
    url.searchParams.set('access_token', connection.userAccessToken);
    const payload = await graphJson(url.toString());
    const accounts = (payload.data || []).map(account => ({
      id: account.id,
      accountId: account.account_id || String(account.id || '').replace(/^act_/, ''),
      name: account.name || `Reklam hesabı ${account.account_id || ''}`,
      currency: account.currency || '',
      timezoneName: account.timezone_name || '',
      active: account.account_status === undefined || account.account_status === 1,
    })).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'tr'));
    return res.status(200).json({ accounts });
  } catch (caught) {
    return res.status(502).json({ error: caught instanceof Error ? caught.message : 'Reklam hesapları alınamadı.' });
  }
};
