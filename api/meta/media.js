const { GRAPH_URL, graphJson, tokenCookieName, unpack, parseCookies, imageProxyPath } = require('../../lib/meta-common');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = String(Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId || '');
  const since = String(Array.isArray(req.query.since) ? req.query.since[0] : req.query.since || '');
  const until = String(Array.isArray(req.query.until) ? req.query.until[0] : req.query.until || '');
  const latestValue = Array.isArray(req.query.latest) ? req.query.latest[0] : req.query.latest;
  const latest = Math.min(12, Math.max(0, Number(latestValue || 0) || 0));
  const connection = unpack(parseCookies(req)[tokenCookieName(companyId)]);
  if (!connection?.accessToken || !connection.igUserId) return res.status(401).json({ error: 'Meta hesabı bağlı değil.' });

  try {
    const first = new URL(`${GRAPH_URL}/${connection.igUserId}/media`);
    first.searchParams.set('fields', 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp');
    first.searchParams.set('limit', '50');
    first.searchParams.set('access_token', connection.accessToken);
    let nextUrl = first.toString();
    const all = [];
    for (let page = 0; nextUrl && page < (latest ? 1 : 6); page += 1) {
      const payload = await graphJson(nextUrl);
      all.push(...(payload.data || []));
      nextUrl = payload.paging?.next || null;
    }
    const start = since ? new Date(`${since}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;
    const end = until ? new Date(`${until}T23:59:59Z`).getTime() : Number.POSITIVE_INFINITY;
    const selected = latest ? all.slice(0, latest) : all.filter(item => {
      const time = item.timestamp ? new Date(item.timestamp).getTime() : 0;
      return time >= start && time <= end;
    });
    const media = selected.map(item => {
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
    });
  } catch (caught) {
    return res.status(502).json({ error: caught instanceof Error ? caught.message : 'Instagram verileri alınamadı.' });
  }
};
