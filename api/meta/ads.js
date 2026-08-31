const { GRAPH_URL, graphJson, tokenCookieName, unpack, parseCookies, imageProxyPath } = require('../../lib/meta-common');

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

function profileVisits(actions = []) {
  return actions.filter(action => String(action.action_type || '').includes('profile_visit'))
    .reduce((total, action) => total + (Number(action.value) || 0), 0);
}

async function pagedGraph(url, maxPages = 5) {
  const rows = [];
  let next = url;
  let page = 0;
  while (next && page < maxPages) {
    const payload = await graphJson(next);
    rows.push(...(payload.data || []));
    next = payload.paging?.next || '';
    page++;
  }
  return rows;
}

function directCreativeImage(creative = {}) {
  const story = creative.object_story_spec || {};
  const link = story.link_data || {};
  const video = story.video_data || {};
  const photo = story.photo_data || {};
  const assets = creative.asset_feed_spec || {};
  return creative.thumbnail_url
    || creative.image_url
    || video.image_url
    || link.picture
    || link.child_attachments?.find(item => item.picture)?.picture
    || photo.image_url
    || assets.images?.find(item => item.url)?.url
    || assets.videos?.find(item => item.thumbnail_url)?.thumbnail_url
    || '';
}

async function resolvedMediaImage(detail, connection) {
  if (detail.thumbnailUrl) return detail.thumbnailUrl;
  if (detail.instagramMediaId && connection.accessToken) {
    try {
      const url = new URL(`${GRAPH_URL}/${detail.instagramMediaId}`);
      url.searchParams.set('fields', 'media_type,media_url,thumbnail_url');
      url.searchParams.set('access_token', connection.accessToken);
      const media = await graphJson(url.toString());
      const image = media.thumbnail_url || media.media_url || '';
      if (image) return image;
    } catch (_) {}
  }
  if (detail.videoId) {
    try {
      const url = new URL(`${GRAPH_URL}/${detail.videoId}/thumbnails`);
      url.searchParams.set('fields', 'uri,is_preferred,height,width');
      url.searchParams.set('access_token', connection.userAccessToken);
      const thumbnails = await graphJson(url.toString());
      const image = (thumbnails.data || []).find(item => item.is_preferred)?.uri || thumbnails.data?.[0]?.uri || '';
      if (image) return image;
    } catch (_) {}
  }
  if (detail.objectStoryId && connection.accessToken) {
    try {
      const url = new URL(`${GRAPH_URL}/${detail.objectStoryId}`);
      url.searchParams.set('fields', 'full_picture,attachments{media,target,url}');
      url.searchParams.set('access_token', connection.accessToken);
      const story = await graphJson(url.toString());
      return story.full_picture || story.attachments?.data?.[0]?.media?.image?.src || '';
    } catch (_) {}
  }
  return '';
}

async function creativeDetails(adIds, connection) {
  const details = {};
  for (let index = 0; index < adIds.length; index += 40) {
    const ids = adIds.slice(index, index + 40);
    const adsUrl = new URL(`${GRAPH_URL}/`);
    adsUrl.searchParams.set('ids', ids.join(','));
    adsUrl.searchParams.set('fields', 'id,name,status,creative');
    adsUrl.searchParams.set('access_token', connection.userAccessToken);
    const adsPayload = await graphJson(adsUrl.toString());
    await Promise.all(Object.entries(adsPayload || {}).map(async ([id, ad]) => {
      const creativeId = String(ad?.creative?.id || '');
      let creative = ad?.creative || {};
      if (creativeId) {
        const creativeUrl = new URL(`${GRAPH_URL}/${creativeId}`);
        creativeUrl.searchParams.set('fields', 'id,name,thumbnail_url,image_url,video_id,effective_object_story_id,effective_instagram_media_id,object_story_spec,asset_feed_spec');
        creativeUrl.searchParams.set('thumbnail_width', '720');
        creativeUrl.searchParams.set('thumbnail_height', '720');
        creativeUrl.searchParams.set('access_token', connection.userAccessToken);
        try {
          creative = await graphJson(creativeUrl.toString());
        } catch (_) {
          creativeUrl.searchParams.set('fields', 'id,name,thumbnail_url,image_url,video_id,effective_object_story_id,effective_instagram_media_id');
          try { creative = await graphJson(creativeUrl.toString()); } catch (_) {}
        }
      }
      details[id] = {
        status: ad?.status || '',
        thumbnailUrl: directCreativeImage(creative),
        creativeName: creative.name || '',
        instagramMediaId: creative.effective_instagram_media_id || '',
        objectStoryId: creative.effective_object_story_id || '',
        videoId: creative.video_id || creative.object_story_spec?.video_data?.video_id || '',
      };
    }));
  }
  await Promise.all(Object.values(details).map(async detail => {
    if (!detail.thumbnailUrl) detail.thumbnailUrl = await resolvedMediaImage(detail, connection);
  }));
  return details;
}

function comparableText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/instagram\s+gonderisi\s*:?/g, '')
    .replace(/[^a-z0-9çğıöşü]+/gi, ' ')
    .trim();
}

async function instagramMediaLibrary(connection) {
  if (!connection.igUserId || !connection.accessToken) return [];
  const url = new URL(`${GRAPH_URL}/${connection.igUserId}/media`);
  url.searchParams.set('fields', 'id,caption,media_type,thumbnail_url,media_url');
  url.searchParams.set('limit', '100');
  url.searchParams.set('access_token', connection.accessToken);
  return pagedGraph(url.toString(), 4);
}

function matchingInstagramImage(ad, mediaRows) {
  const byId = mediaRows.find(media => String(media.id || '') === String(ad.instagramMediaId || ''));
  if (byId) return byId.thumbnail_url || byId.media_url || '';
  const adText = comparableText(ad.name);
  if (!adText) return '';
  const match = mediaRows.find(media => {
    const caption = comparableText(media.caption);
    if (!caption) return false;
    const captionLead = caption.slice(0, Math.min(48, caption.length));
    const adLead = adText.slice(0, Math.min(48, adText.length));
    return captionLead.length >= 18 && (adText.includes(captionLead) || caption.includes(adLead));
  });
  return match?.thumbnail_url || match?.media_url || '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = String(Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId || '');
  const accountId = String(Array.isArray(req.query.adAccountId) ? req.query.adAccountId[0] : req.query.adAccountId || '').replace(/^act_/, '').replace(/\D/g, '');
  const since = safeDate(Array.isArray(req.query.since) ? req.query.since[0] : req.query.since);
  const until = safeDate(Array.isArray(req.query.until) ? req.query.until[0] : req.query.until);
  const connection = unpack(parseCookies(req)[tokenCookieName(companyId)]);
  if (!connection?.userAccessToken || !connection.adsRead) return res.status(403).json({ error: 'Reklam okuma izni bulunamadı.' });
  if (!accountId || !since || !until) return res.status(400).json({ error: 'Reklam hesabı veya tarih aralığı eksik.' });

  try {
    const accountsUrl = new URL(`${GRAPH_URL}/me/adaccounts`);
    accountsUrl.searchParams.set('fields', 'id,account_id');
    accountsUrl.searchParams.set('limit', '100');
    accountsUrl.searchParams.set('access_token', connection.userAccessToken);
    const accountsPayload = await graphJson(accountsUrl.toString());
    const allowed = (accountsPayload.data || []).some(account => (account.account_id || String(account.id || '').replace(/^act_/, '')) === accountId);
    if (!allowed) return res.status(403).json({ error: 'Bu reklam hesabına erişim bulunamadı.' });

    const totalUrl = new URL(`${GRAPH_URL}/act_${accountId}/insights`);
    totalUrl.searchParams.set('fields', 'spend,impressions,reach,clicks,actions,account_currency');
    totalUrl.searchParams.set('level', 'account');
    totalUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
    totalUrl.searchParams.set('limit', '10');
    totalUrl.searchParams.set('access_token', connection.userAccessToken);

    const adsUrl = new URL(`${GRAPH_URL}/act_${accountId}/insights`);
    adsUrl.searchParams.set('fields', 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,reach,clicks,actions,account_currency');
    adsUrl.searchParams.set('level', 'ad');
    adsUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
    adsUrl.searchParams.set('limit', '100');
    adsUrl.searchParams.set('access_token', connection.userAccessToken);

    const [totalPayload, adInsights] = await Promise.all([
      graphJson(totalUrl.toString()),
      pagedGraph(adsUrl.toString()),
    ]);
    const insight = totalPayload.data?.[0] || {};
    const adIds = [...new Set(adInsights.map(row => String(row.ad_id || '')).filter(Boolean))];
    let creativeByAd = {};
    try { creativeByAd = await creativeDetails(adIds, connection); } catch (_) {}
    const ads = adInsights.map(row => {
      const creative = creativeByAd[String(row.ad_id || '')] || {};
      return {
        id: String(row.ad_id || ''),
        name: row.ad_name || creative.creativeName || 'İsimsiz reklam',
        campaignName: row.campaign_name || '',
        adsetName: row.adset_name || '',
        spend: row.spend || '0',
        impressions: row.impressions || '0',
        reach: row.reach || '0',
        clicks: row.clicks || '0',
        profileVisits: String(profileVisits(row.actions) || ''),
        currency: row.account_currency || insight.account_currency || '',
        thumbnailUrl: creative.thumbnailUrl || '',
        status: creative.status || '',
        instagramMediaId: creative.instagramMediaId || '',
      };
    }).sort((left, right) => Number(right.spend || 0) - Number(left.spend || 0));
    if (ads.some(ad => !ad.thumbnailUrl)) {
      try {
        const mediaRows = await instagramMediaLibrary(connection);
        ads.forEach(ad => { if (!ad.thumbnailUrl) ad.thumbnailUrl = matchingInstagramImage(ad, mediaRows); });
      } catch (_) {}
    }
    ads.forEach(ad => { if (ad.thumbnailUrl) ad.thumbnailUrl = imageProxyPath(ad.thumbnailUrl); });
    const visits = profileVisits(insight.actions);
    return res.status(200).json({
      spend: insight.spend || '0',
      impressions: insight.impressions || '0',
      reach: insight.reach || '0',
      clicks: insight.clicks || '0',
      profileVisits: visits ? String(visits) : '',
      currency: insight.account_currency || '',
      ads,
    });
  } catch (caught) {
    return res.status(502).json({ error: caught instanceof Error ? caught.message : 'Reklam verileri alınamadı.' });
  }
};
