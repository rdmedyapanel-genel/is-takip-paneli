const { safeCompanyId, pendingCookieName, unpack, parseCookies, instagramCandidates } = require('../../lib/meta-common');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = safeCompanyId(req.query.companyId);
  const pending = unpack(parseCookies(req)[pendingCookieName(companyId)]);
  if (!pending?.userAccessToken) return res.status(401).json({ error: 'Meta hesap seçimi süresi doldu. Yeniden bağlanın.' });
  try {
    const candidates = await instagramCandidates(pending.userAccessToken);
    return res.status(200).json({ accounts: candidates.map(item => ({ pageId: item.pageId, pageName: item.pageName, igUserId: item.igUserId, username: item.username })) });
  } catch (caught) {
    return res.status(502).json({ error: caught instanceof Error ? caught.message : 'Instagram hesapları alınamadı.' });
  }
};
