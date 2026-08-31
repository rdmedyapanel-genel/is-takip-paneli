const {
  safeCompanyId, pendingCookieName, tokenCookieName, pack, unpack, parseCookies,
  cookie, instagramCandidates,
} = require('../../lib/meta-common');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = safeCompanyId(req.query.companyId);
  const igUserId = String(Array.isArray(req.query.igUserId) ? req.query.igUserId[0] : req.query.igUserId || '').replace(/\D/g, '');
  const pending = unpack(parseCookies(req)[pendingCookieName(companyId)]);
  if (!pending?.userAccessToken) return res.status(401).json({ error: 'Meta hesap seçimi süresi doldu. Yeniden bağlanın.' });
  if (!igUserId) return res.status(400).json({ error: 'Instagram hesabı seçilmedi.' });
  try {
    const candidates = await instagramCandidates(pending.userAccessToken);
    const selected = candidates.find(item => item.igUserId === igUserId);
    if (!selected) return res.status(403).json({ error: 'Seçilen Instagram hesabına erişim bulunamadı.' });
    const connection = {
      accessToken: selected.accessToken,
      userAccessToken: pending.userAccessToken,
      pageId: selected.pageId,
      pageName: selected.pageName || '',
      igUserId: selected.igUserId,
      username: selected.username || '',
      adsRead: pending.adsRead === true,
      insightsRead: pending.insightsRead === true,
      businessManagement: pending.businessManagement === true,
    };
    res.setHeader('Set-Cookie', [
      cookie(req, tokenCookieName(companyId), pack(connection), Math.min(Number(pending.maxAge) || 5184000, 5184000)),
      cookie(req, pendingCookieName(companyId), '', 0),
    ]);
    return res.status(200).json({
      username: connection.username, pageId: connection.pageId, igUserId: connection.igUserId,
      adsRead: connection.adsRead, insightsRead: connection.insightsRead,
    });
  } catch (caught) {
    return res.status(502).json({ error: caught instanceof Error ? caught.message : 'Instagram hesabı bağlanamadı.' });
  }
};
