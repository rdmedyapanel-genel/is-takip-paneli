const {
  safeCompanyId, safeCustomerId, getGoogleAdsConfig, connectionFromRequest,
  refreshAccessToken, listAccessibleCustomers, searchStream,
} = require('../../lib/google-ads-common');

const hierarchyQuery = `
  SELECT
    customer_client.id,
    customer_client.descriptive_name,
    customer_client.currency_code,
    customer_client.time_zone,
    customer_client.manager,
    customer_client.level,
    customer_client.status
  FROM customer_client
  WHERE customer_client.level <= 1`;

const customerQuery = `
  SELECT
    customer.id,
    customer.descriptive_name,
    customer.currency_code,
    customer.time_zone,
    customer.manager,
    customer.status
  FROM customer
  LIMIT 1`;

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

module.exports = async function handler(req, res) {
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
    const accounts = new Map();
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
        if (!account.manager) accounts.set(account.customerId, account);
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
          else if (account.status !== 'CANCELED' && account.status !== 'CANCELLED') accounts.set(account.customerId, account);
        }
      }

      if (!clients.length) {
        try {
          const selfRows = await searchStream(accessToken, config, rootId, '', customerQuery);
          const customer = selfRows[0]?.customer;
          const account = accountFromClient(customer, '');
          if (account.customerId && !account.manager) accounts.set(account.customerId, account);
        } catch (_) {}
      }
    }

    return res.status(200).json({
      accounts: [...accounts.values()].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    });
  } catch (caught) {
    const status = Number(caught?.status) === 401 ? 401 : 502;
    return res.status(status).json({ error: caught instanceof Error ? caught.message : 'Google Ads hesapları alınamadı.' });
  }
};
