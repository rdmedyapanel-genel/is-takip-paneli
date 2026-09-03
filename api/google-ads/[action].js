const handlers = require('../../lib/google-ads-handlers');

module.exports = async function handler(req, res) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const selected = handlers[String(action || '')];
  if (!selected) return res.status(404).json({ error: 'Google Ads işlemi bulunamadı.' });
  return selected(req, res);
};
