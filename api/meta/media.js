const { GRAPH_URL, graphJson, tokenCookieName, unpack, parseCookies, imageProxyPath } = require('../../lib/meta-common');

function metricValue(payload) {
  const row = payload?.data?.[0];
  if (!row) return null;
  const total = row.total_value?.value;
  if (total != null && Number.isFinite(Number(total))) return Number(total);
  const values = Array.isArray(row.values) ? row.values : [];
  const numeric = values.map(item => Number(item?.value)).filter(Number.isFinite);
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) : null;
}

async function mediaInsights(item, accessToken) {
  const metrics = ['reach', 'saved', 'shares', 'views', 'total_interactions'];
  const fetchMetrics = async names => {
    const url = new URL(`${GRAPH_URL}/${item.id}/insights`);
    url.searchParams.set('metric', names.join(','));
    url.searchParams.set('access_token', accessToken);
    const payload = await graphJson(url.toString());
    return (payload.data || []).reduce((all, row) => {
      const value = metricValue({ data: [row] });
      if (value != null) all[row.name] = value;
      return all;
    }, {});
  };
  let values = {};
  try { values = await fetchMetrics(metrics); }
  catch (_) {
    const settled = await Promise.allSettled(metrics.map(async metric => ({ metric, values: await fetchMetrics([metric]) })));
    settled.forEach(result => { if (result.status === 'fulfilled') Object.assign(values, result.value.values); });
  }
  const likes = Number(item.like_count) || 0;
  const comments = Number(item.comments_count) || 0;
  const saves = Number(values.saved) || 0;
  const shares = Number(values.shares) || 0;
  const calculatedInteractions = likes + comments + saves + shares;
  return {
    reach: Number(values.reach) || 0,
    views: Number(values.views) || 0,
    likes,
    comments,
    saves,
    shares,
    interactions: Number(values.total_interactions) || calculatedInteractions,
    hasInsights: Object.keys(values).length > 0 || likes > 0 || comments > 0,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = String(Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId || '');
  const since = String(Array.isArray(req.query.since) ? req.query.since[0] : req.query.since || '');
  const until = String(Array.isArray(req.query.until) ? req.query.until[0] : req.query.until || '');
  const latestValue = Array.isArray(req.query.latest) ? req.query.latest[0] : req.query.latest;
  const latest = Math.min(12, Math.max(0, Number(latestValue || 0) || 0));
  const historyValue = Array.isArray(req.query.history) ? req.query.history[0] : req.query.history;
  const history = Math.min(300, Math.max(0, Number(historyValue || 0) || 0));
  const includeInsights = String(Array.isArray(req.query.includeInsights) ? req.query.includeInsights[0] : req.query.includeInsights || '') === '1';
  const connection = unpack(parseCookies(req)[tokenCookieName(companyId)]);
  if (!connection?.accessToken || !connection.igUserId) return res.status(401).json({ error: 'Meta hesabı bağlı değil.' });

  try {
    const first = new URL(`${GRAPH_URL}/${connection.igUserId}/media`);
    first.searchParams.set('fields', 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count');
    first.searchParams.set('limit', '50');
    first.searchParams.set('access_token', connection.accessToken);
    let nextUrl = first.toString();
    const all = [];
    const maxPages = history ? Math.ceil(history / 50) : (latest ? 1 : 6);
    for (let page = 0; nextUrl && page < maxPages; page += 1) {
      const payload = await graphJson(nextUrl);
      all.push(...(payload.data || []));
      nextUrl = payload.paging?.next || null;
    }
    const start = since ? new Date(`${since}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    const end = until ? new Date(`${until}T23:59:59Z`).getTime() : Number.POSITIVE_INFINITY;
    const selected = history ? all.slice(0, history) : (latest ? all.slice(0, latest) : all.filter(item => {
      const time = item.timestamp ? new Date(item.timestamp).getTime() : 0;
      return time >= start && time <= end;
    }));
    const insightRows = includeInsights ? await Promise.all(selected.map(async item => {
      try { return await mediaInsights(item, connection.accessToken); }
      catch (_) { return { likes: Number(item.like_count) || 0, comments: Number(item.comments_count) || 0, reach: 0, views: 0, saves: 0, shares: 0, interactions: (Number(item.like_count) || 0) + (Number(item.comments_count) || 0), hasInsights: false }; }
    })) : [];
    const media = selected.map((item, index) => {
      const originalThumbnailUrl = item.thumbnail_url || item.media_url || '';
      const thumbnailUrl = imageProxyPath(originalThumbnailUrl) || originalThumbnailUrl;
      return {
        id: item.id,
        date: item.timestamp?.slice(0, 10) || '',
        type: item.media_product_type === 'REELS' ? 'Reels' : 'Gönderi',
        mediaType: item.media_type || '',
        caption: item.caption || '',
        permalink: item.permalink || '',
        thumbnailUrl,
        thumbnailFallbackUrl: thumbnailUrl !== originalThumbnailUrl ? originalThumbnailUrl : '',
        insights: includeInsights ? insightRows[index] : null,
      };
    });
    let profile = {};
    try {
      const profileUrl = new URL(`${GRAPH_URL}/${connection.igUserId}`);
      profileUrl.searchParams.set('fields', 'username,followers_count,media_count,profile_picture_url');
      profileUrl.searchParams.set('access_token', connection.accessToken);
      profile = await graphJson(profileUrl.toString());
    } catch (_) {}
    const originalProfilePictureUrl = profile.profile_picture_url || '';
    const profilePictureUrl = imageProxyPath(originalProfilePictureUrl) || originalProfilePictureUrl;
    return res.status(200).json({
      username: profile.username || connection.username || '',
      profile: {
        followersCount: profile.followers_count ?? null,
        mediaCount: profile.media_count ?? null,
        profilePictureUrl,
        profilePictureFallbackUrl: profilePictureUrl !== originalProfilePictureUrl ? originalProfilePictureUrl : '',
      },
      media,
      historyScanned: history ? all.length : 0,
    });
  } catch (caught) {
    return res.status(502).json({ error: caught instanceof Error ? caught.message : 'Instagram verileri alınamadı.' });
  }
};
