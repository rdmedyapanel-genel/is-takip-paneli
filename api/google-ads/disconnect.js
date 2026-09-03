const { safeCompanyId, getGoogleAdsConfig, tokenCookieName, cookie } = require('../../lib/google-ads-common');

module.exports = async function handler(req, res) {
  const companyId = safeCompanyId(req.query.companyId);
  getGoogleAdsConfig(req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', cookie(req, tokenCookieName(companyId), '', 0));
  return res.status(200).json({ disconnected: true });
};
