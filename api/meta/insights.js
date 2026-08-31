const { GRAPH_URL, graphJson, tokenCookieName, unpack, parseCookies } = require('../../lib/meta-common');

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

function insightValue(payload) {
  const insight = payload?.data?.[0];
  if (!insight) return null;
  const total = insight.total_value?.value;
  if (total != null && Number.isFinite(Number(total))) return Number(total);
  const values = Array.isArray(insight.values) ? insight.values : [];
  const numeric = values.map(item => Number(item?.value)).filter(Number.isFinite);
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) : null;
}

async function fetchMetric(connection, metric, since, until) {
  const buildUrl = includeTotalValue => {
    const url = new URL(`${GRAPH_URL}/${connection.igUserId}/insights`);
    url.searchParams.set('metric', metric);
    url.searchParams.set('period', 'day');
    url.searchParams.set('since', since);
    url.searchParams.set('until', until);
    if (includeTotalValue) url.searchParams.set('metric_type', 'total_value');
    url.searchParams.set('access_token', connection.accessToken);
    return url.toString();
  };
  try {
    return insightValue(await graphJson(buildUrl(true)));
  } catch (firstError) {
    try { return insightValue(await graphJson(buildUrl(false))); }
    catch (_) { throw firstError; }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = String(Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId || '');
  const since = safeDate(Array.isArray(req.query.since) ? req.query.since[0] : req.query.since);
  const until = safeDate(Array.isArray(req.query.until) ? req.query.until[0] : req.query.until);
  const connection = unpack(parseCookies(req)[tokenCookieName(companyId)]);
  if (!connection?.accessToken || !connection.igUserId) return res.status(401).json({ error: 'Meta hesabı bağlı değil.' });
  if (!since || !until) return res.status(400).json({ error: 'İstatistik tarih aralığı eksik.' });

  const metrics = ['views', 'reach', 'profile_views', 'likes', 'comments', 'saves', 'shares'];
  const settled = await Promise.allSettled(metrics.map(metric => fetchMetric(connection, metric, since, until)));
  const values = {};
  const unavailable = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value != null) values[metrics[index]] = result.value;
    else unavailable.push(metrics[index]);
  });
  if (settled.every(result => result.status === 'rejected')) {
    const reason = settled.find(result => result.status === 'rejected')?.reason;
    return res.status(403).json({ error: reason instanceof Error ? reason.message : 'Instagram istatistik izni bulunamadı.' });
  }
  return res.status(200).json({
    views: values.views,
    reach: values.reach,
    profileVisits: values.profile_views,
    likes: values.likes,
    comments: values.comments,
    saves: values.saves,
    shares: values.shares,
    unavailable,
    hasData: Object.keys(values).length > 0,
  });
};
