const {
  safeCompanyId, safeCustomerId, getGoogleAdsConfig, connectionFromRequest,
  refreshAccessToken, searchStream,
} = require('../../lib/google-ads-common');

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = safeCompanyId(req.query.companyId);
  const customerId = safeCustomerId(req.query.customerId);
  const loginCustomerId = safeCustomerId(req.query.loginCustomerId);
  const since = safeDate(Array.isArray(req.query.since) ? req.query.since[0] : req.query.since);
  const until = safeDate(Array.isArray(req.query.until) ? req.query.until[0] : req.query.until);
  const config = getGoogleAdsConfig(req);
  const connection = connectionFromRequest(req, companyId, config);
  if (!connection) return res.status(401).json({ error: 'Google Ads bağlantısı bulunamadı. Firmayı yeniden bağlayın.' });
  if (!customerId || !since || !until) return res.status(400).json({ error: 'Google Ads hesabı veya tarih aralığı eksik.' });

  const query = `
    SELECT
      customer.descriptive_name,
      customer.currency_code,
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC`;

  try {
    const accessToken = await refreshAccessToken(connection, config);
    const rows = await searchStream(accessToken, config, customerId, loginCustomerId, query);
    const campaigns = rows.map(row => ({
      id: String(row.campaign?.id || ''),
      name: row.campaign?.name || 'İsimsiz kampanya',
      status: row.campaign?.status || '',
      type: row.campaign?.advertisingChannelType || '',
      spend: number(row.metrics?.costMicros) / 1000000,
      impressions: number(row.metrics?.impressions),
      clicks: number(row.metrics?.clicks),
      conversions: number(row.metrics?.conversions),
      conversionValue: number(row.metrics?.conversionsValue),
    })).sort((left, right) => right.spend - left.spend);
    const totals = campaigns.reduce((all, campaign) => ({
      spend: all.spend + campaign.spend,
      impressions: all.impressions + campaign.impressions,
      clicks: all.clicks + campaign.clicks,
      conversions: all.conversions + campaign.conversions,
      conversionValue: all.conversionValue + campaign.conversionValue,
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 });
    return res.status(200).json({
      customerId,
      customerName: rows[0]?.customer?.descriptiveName || '',
      currency: rows[0]?.customer?.currencyCode || 'TRY',
      ...totals,
      campaigns,
    });
  } catch (caught) {
    const status = Number(caught?.status) === 401 ? 401 : 502;
    return res.status(status).json({ error: caught instanceof Error ? caught.message : 'Google Ads raporu alınamadı.' });
  }
};
