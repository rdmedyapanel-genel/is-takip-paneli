const {
  GOOGLE_ADS_SCOPE, TOKEN_URL, crypto, first, safeCompanyId, safeCustomerId,
  getGoogleAdsConfig, parseCookies, tokenCookieName, cookie, seal, unseal,
  jsonResponse, redirect, panelUrl, connectionFromRequest, refreshAccessToken,
  listAccessibleCustomers, searchStream,
} = require('./google-ads-common');

const hierarchyQuery = [
  'SELECT',
  '  customer_client.id,',
  '  customer_client.descriptive_name,',
  '  customer_client.currency_code,',
  '  customer_client.time_zone,',
  '  customer_client.manager,',
  '  customer_client.level,',
  '  customer_client.status',
  'FROM customer_client',
  'WHERE customer_client.level <= 1',
].join('\n');

const customerQuery = [
  'SELECT',
  '  customer.id,',
  '  customer.descriptive_name,',
  '  customer.currency_code,',
  '  customer.time_zone,',
  '  customer.manager,',
  '  customer.status',
  'FROM customer',
  'LIMIT 1',
].join('\n');

function accountFromClient(client, loginCustomerId = '') {
  return {
    customerId: safeCustomerId(client?.id),
    loginCustomerId: safeCustomerId(loginCustomerId),
    name: client?.descriptiveName || `Google Ads ${safeCustomerId(client?.id)}`,
    currency: client?.currencyCode || '',
    timeZone: client?.timeZone || '',
    manager: client?.manager === true,
    status: client?.status || '',
  };
}

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function connect(req, res) {
  const companyId = safeCompanyId(req.query.companyId);
  const config = getGoogleAdsConfig(req);
  if (!companyId) return redirect(res, panelUrl(req, { google_ads_error: 'Firma seçilmedi.' }));
  if (!config.clientId || !config.clientSecret || !config.developerToken) {
    return redirect(res, panelUrl(req, { google_ads_error: 'Google Ads ayarları Vercel üzerinde eksik.', companyId }));
  }

  const nonce = crypto.randomUUID();
  const state = `${companyId}.${nonce}`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_ADS_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  res.setHeader('Set-Cookie', cookie(req, 'rdgrup_google_ads_state', seal({ companyId, nonce }, config.clientSecret), 600));
  return redirect(res, authUrl.toString());
}

async function callback(req, res) {
  const config = getGoogleAdsConfig(req);
  const error = first(req.query.error);
  const stored = unseal(parseCookies(req).rdgrup_google_ads_state, config.clientSecret);
  if (error) return redirect(res, panelUrl(req, { google_ads_error: error, companyId: stored?.companyId || '' }));

  const code = first(req.query.code);
  const state = first(req.query.state);
  if (!stored || state !== `${stored.companyId}.${stored.nonce}` || !code) {
    return redirect(res, panelUrl(req, { google_ads_error: 'Google Ads güvenlik doğrulaması başarısız.', companyId: stored?.companyId || '' }));
  }

  try {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    });
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const token = await jsonResponse(response, 'Google Ads bağlantısı tamamlanamadı.');
    if (!token.refresh_token) throw new Error('Google yenileme anahtarı alınamadı. Bağlantıyı kaldırıp yeniden izin verin.');
    const connection = { refreshToken: token.refresh_token, scope: token.scope || '', connectedAt: new Date().toISOString() };
    res.setHeader('Set-Cookie', [
      cookie(req, tokenCookieName(stored.companyId), seal(connection, config.clientSecret), 180 * 24 * 60 * 60),
      cookie(req, 'rdgrup_google_ads_state', '', 0),
    ]);
    return redirect(res, panelUrl(req, { google_ads_choose: '1', companyId: stored.companyId }));
  } catch (caught) {
    return redirect(res, panelUrl(req, {
      google_ads_error: (caught instanceof Error ? caught.message : 'Google Ads bağlantısı tamamlanamadı.').slice(0, 180),
      companyId: stored.companyId,
    }));
  }
}

async function disconnect(req, res) {
  const companyId = safeCompanyId(req.query.companyId);
  getGoogleAdsConfig(req);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', cookie(req, tokenCookieName(companyId), '', 0));
  return res.status(200).json({ disconnected: true });
}

async function accounts(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const companyId = safeCompanyId(req.query.companyId);
  const config = getGoogleAdsConfig(req);
  if (!config.developerToken) return res.status(500).json({ error: 'Google Ads geliştirici anahtarı eksik.' });
  const connection = connectionFromRequest(req, companyId, config);
  if (!connection) return res.status(401).json({ error: 'Google Ads bağlantısı bulunamadı. Firmayı yeniden bağlayın.' });

  try {
    const accessToken = await refreshAccessToken(connection, config);
    const accessible = await listAccessibleCustomers(accessToken, config);
    const roots = (accessible.resourceNames || []).map(name => safeCustomerId(String(name).split('/').pop())).filter(Boolean);
    const foundAccounts = new Map();
    const visitedManagers = new Set();

    for (const rootId of roots.slice(0, 20)) {
      let rows = [];
      try { rows = await searchStream(accessToken, config, rootId, '', hierarchyQuery); } catch (_) {}
      const clients = rows.map(row => row.customerClient).filter(Boolean);
      const rootClient = clients.find(client => safeCustomerId(client.id) === rootId);
      const rootIsManager = rootClient?.manager === true;
      const rootLoginId = rootIsManager ? rootId : '';

      for (const client of clients) {
        const account = accountFromClient(client, rootLoginId);
        if (!account.customerId || account.status === 'CANCELED' || account.status === 'CANCELLED') continue;
        if (!account.manager) foundAccounts.set(account.customerId, account);
      }

      const managerQueue = clients.filter(client => client?.manager === true && safeCustomerId(client.id) !== rootId)
        .map(client => safeCustomerId(client.id)).filter(Boolean);
      while (managerQueue.length && visitedManagers.size < 40) {
        const managerId = managerQueue.shift();
        if (!managerId || visitedManagers.has(managerId)) continue;
        visitedManagers.add(managerId);
        let childRows = [];
        try { childRows = await searchStream(accessToken, config, managerId, rootId, hierarchyQuery); } catch (_) { continue; }
        for (const row of childRows) {
          const client = row.customerClient;
          const childId = safeCustomerId(client?.id);
          if (!childId || childId === managerId) continue;
          const account = accountFromClient(client, rootId);
          if (account.manager) managerQueue.push(childId);
          else if (account.status !== 'CANCELED' && account.status !== 'CANCELLED') foundAccounts.set(account.customerId, account);
        }
      }

      if (!clients.length) {
        try {
          const selfRows = await searchStream(accessToken, config, rootId, '', customerQuery);
          const customer = selfRows[0]?.customer;
          const account = accountFromClient(customer, '');
          if (account.customerId && !account.manager) foundAccounts.set(account.customerId, account);
        } catch (_) {}
      }
    }

    return res.status(200).json({
      accounts: [...foundAccounts.values()].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    });
  } catch (caught) {
    const status = Number(caught?.status) === 401 ? 401 : 502;
    return res.status(status).json({ error: caught instanceof Error ? caught.message : 'Google Ads hesapları alınamadı.' });
  }
}

async function report(req, res) {
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

  const query = [
    'SELECT',
    '  customer.descriptive_name,',
    '  customer.currency_code,',
    '  campaign.id,',
    '  campaign.name,',
    '  campaign.status,',
    '  campaign.advertising_channel_type,',
    '  metrics.cost_micros,',
    '  metrics.impressions,',
    '  metrics.clicks,',
    '  metrics.conversions,',
    '  metrics.conversions_value',
    'FROM campaign',
    `WHERE segments.date BETWEEN '${since}' AND '${until}'`,
    "  AND campaign.status != 'REMOVED'",
    'ORDER BY metrics.cost_micros DESC',
  ].join('\n');

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
}

module.exports = { connect, callback, disconnect, accounts, report };
