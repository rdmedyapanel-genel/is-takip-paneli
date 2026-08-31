const { tokenCookieName, cookie } = require('../../lib/meta-common');

module.exports = async function handler(req, res) {
  const companyId = String(Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId || '');
  res.setHeader('Set-Cookie', cookie(req, tokenCookieName(companyId), '', 0));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
};
