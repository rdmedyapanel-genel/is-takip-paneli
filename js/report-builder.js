const rbMonthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const rbAdVatRate = 0.20;
let rbState = null;
let rbPendingCompanyLogo = '';
let rbPendingCompanyLogoTint = true;
let rbEditingCompanyId = '';

function rbEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function rbCurrentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function rbEmptyState(companyId, period) {
    const company = dbReportCompanies.find(item => item.docId === companyId) || {};
    return {
        companyId,
        period,
        accent: company.reportColor || company.color || '#6c63ff',
        contents: [],
        storyCount: '',
        profileImage: '',
        profilePosts: [],
        topContents: [],
        metaProfile: {},
        metaAdAccounts: [],
        metaAdAccountsLoaded: false,
        metaAds: [],
        adAccountId: company.reportAdAccountId || '',
        views: '', reach: '', profileVisits: '', followers: '',
        likes: '', comments: '', saves: '', shares: '',
        adSpend: '', adImpressions: '', adReach: '', adClicks: '', adCurrency: 'TRY',
        notes: ''
    };
}

function rbStorageKey(companyId, period) {
    return `rdgrup-native-report-${companyId}-${period}`;
}

function rbContextKey() {
    return 'rdgrup-native-report-context';
}

function rbRememberContext(companyId, period) {
    if (!companyId || !/^\d{4}-\d{2}$/.test(String(period || ''))) return;
    localStorage.setItem(rbContextKey(), JSON.stringify({ companyId, period }));
}

function rbPreferredPeriod(companyId) {
    try {
        const context = JSON.parse(localStorage.getItem(rbContextKey()) || 'null');
        if (context?.companyId === companyId && /^\d{4}-\d{2}$/.test(String(context.period || ''))) return context.period;
        const prefix = `rdgrup-native-report-${companyId}-`;
        const savedPeriods = [];
        const meaningfulPeriods = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index) || '';
            if (!key.startsWith(prefix)) continue;
            const period = key.slice(prefix.length);
            if (!/^\d{4}-\d{2}$/.test(period)) continue;
            savedPeriods.push(period);
            try {
                const saved = JSON.parse(localStorage.getItem(key) || 'null');
                const hasLists = ['contents','profilePosts','metaAds'].some(field => Array.isArray(saved?.[field]) && saved[field].length);
                const hasMetrics = ['views','reach','profileVisits','followers','likes','comments','saves','shares','adSpend','adImpressions','adReach','adClicks'].some(field => String(saved?.[field] || '').trim());
                if (hasLists || hasMetrics || String(saved?.notes || '').trim()) meaningfulPeriods.push(period);
            } catch (_) {}
        }
        if (meaningfulPeriods.length) return meaningfulPeriods.sort().at(-1);
        if (savedPeriods.length) return savedPeriods.sort().at(-1);
    } catch (_) {}
    return rbCurrentPeriod();
}

function rbLoadState(companyId, period) {
    const empty = rbEmptyState(companyId, period);
    try {
        const saved = JSON.parse(localStorage.getItem(rbStorageKey(companyId, period)) || 'null');
        return saved ? {
            ...empty,
            ...saved,
            companyId,
            period,
            contents: Array.isArray(saved.contents) ? saved.contents : [],
            profilePosts: Array.isArray(saved.profilePosts) ? saved.profilePosts : [],
            topContents: Array.isArray(saved.topContents) ? saved.topContents : [],
            metaProfile: saved.metaProfile && typeof saved.metaProfile === 'object' ? saved.metaProfile : {},
            metaAdAccounts: Array.isArray(saved.metaAdAccounts) ? saved.metaAdAccounts : [],
            metaAds: Array.isArray(saved.metaAds) ? saved.metaAds : [],
            adAccountId: empty.adAccountId || saved.adAccountId || ''
        } : empty;
    } catch (_) { return empty; }
}

function rbCompany() {
    return dbReportCompanies.find(item => item.docId === rbState?.companyId) || dbReportCompanies[0] || {};
}

function rbMetaConnections() {
    try { return JSON.parse(localStorage.getItem('rdgrup-panel-meta-connections') || '{}'); }
    catch (_) { return {}; }
}

function rbMetaConnection() {
    return rbMetaConnectionFor(rbState?.companyId);
}

function rbMetaConnectionFor(companyId) {
    return rbMetaConnections()[companyId] || null;
}

function rbReadMetaRedirect() {
    const params = new URLSearchParams(window.location.search);
    const companyId = params.get('companyId') || '';
    if (params.get('meta_connected') === '1' && companyId) {
        const connections = rbMetaConnections();
        connections[companyId] = {
            username: params.get('username') || '',
            pageId: params.get('pageId') || '',
            igUserId: params.get('igUserId') || '',
            adsRead: params.get('adsRead') === '1',
            insightsRead: params.get('insightsRead') === '1',
            connectedAt: new Date().toISOString()
        };
        localStorage.setItem('rdgrup-panel-meta-connections', JSON.stringify(connections));
        if (rbState && rbState.companyId !== companyId && dbReportCompanies.some(item => item.docId === companyId)) rbState = rbLoadState(companyId, rbState.period);
        if (rbState) { rbState.metaAdAccountsLoaded = false; rbState.metaAdAccounts = []; }
        window.history.replaceState({}, '', `${window.location.pathname}?view=reports`);
    } else if (params.get('meta_choose') === '1' && companyId) {
        window.history.replaceState({}, '', `${window.location.pathname}?view=reports`);
        setTimeout(() => rbOpenMetaAccountChooser(companyId), 50);
    } else if (params.get('meta_error')) {
        const message = params.get('meta_error');
        window.history.replaceState({}, '', `${window.location.pathname}?view=reports`);
        setTimeout(() => alert(`Meta bağlantısı tamamlanamadı: ${message}`), 50);
    }
}

function rbInstagramUsername(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try { if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname.split('/').filter(Boolean)[0] || ''; }
    catch (_) {}
    return raw.replace(/^@/, '').split(/[/?#]/)[0];
}

function rbIsOnlineMetaEnvironment() {
    return !['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function rbConnectMetaForCompany(companyId) {
    const company = dbReportCompanies.find(item => item.docId === companyId) || {};
    if (!company.docId) return alert('Önce firma ekleyip seçin.');
    if (!rbIsOnlineMetaEnvironment()) return alert('Meta bağlantısı güvenlik nedeniyle GitHub/Vercel üzerindeki çevrim içi panelde çalışır. Güncel dosyaları yükledikten sonra aynı düğmeye basın.');
    const username = rbInstagramUsername(company.instagram);
    window.location.href = `/api/meta/connect?companyId=${encodeURIComponent(company.docId)}&expectedUsername=${encodeURIComponent(username)}`;
}

function rbConnectMeta() {
    return rbConnectMetaForCompany(rbState?.companyId || '');
}

async function rbOpenMetaAccountChooser(companyId) {
    rbCloseCompanyModal();
    const company = dbReportCompanies.find(item => item.docId === companyId) || {};
    const modal = document.createElement('div');
    modal.id = 'rb-company-modal';
    modal.className = 'rb-company-modal';
    modal.innerHTML = `<div class="rb-company-dialog rb-meta-chooser" role="dialog" aria-modal="true" aria-labelledby="rb-meta-chooser-title"><button type="button" class="rb-company-close" onclick="rbCloseCompanyModal()" aria-label="Kapat">×</button><div class="rb-company-dialog-head"><span><i class="fa-brands fa-instagram"></i></span><div><h3 id="rb-meta-chooser-title">Instagram Hesabını Seç</h3><p>${rbEscape(company.name || 'Seçili firma')} için bağlanacak hesabı seçin.</p></div></div><div class="rb-meta-chooser-list"><div class="rb-meta-chooser-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Hesaplar Meta’dan alınıyor…</span></div></div></div>`;
    modal.addEventListener('click', event => { if (event.target === modal) rbCloseCompanyModal(); });
    document.body.appendChild(modal);
    document.addEventListener('keydown', rbCompanyModalEscape);
    try {
        const response = await fetch(`/api/meta/account-candidates?companyId=${encodeURIComponent(companyId)}`, { credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Instagram hesapları alınamadı.');
        const list = modal.querySelector('.rb-meta-chooser-list');
        if (!list) return;
        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        list.innerHTML = accounts.length ? accounts.map(account => `<button type="button" class="rb-meta-account" onclick="rbSelectMetaAccount('${rbEscape(companyId)}','${rbEscape(account.igUserId)}',this)"><span><i class="fa-brands fa-instagram"></i></span><div><strong>@${rbEscape(account.username || 'kullaniciadi-alinamadi')}</strong><small>${rbEscape(account.pageName || 'Bağlı Facebook Sayfası')}</small></div><i class="fa-solid fa-chevron-right"></i></button>`).join('') : '<div class="rb-meta-chooser-empty"><i class="fa-regular fa-circle-xmark"></i><b>Bağlanabilir Instagram hesabı bulunamadı</b><span>Hesabın bağlı olduğu Facebook Sayfasında tam erişiminiz olduğundan emin olun.</span></div>';
    } catch (error) {
        const list = modal.querySelector('.rb-meta-chooser-list');
        if (list) list.innerHTML = `<div class="rb-meta-chooser-empty"><i class="fa-solid fa-triangle-exclamation"></i><b>Hesaplar alınamadı</b><span>${rbEscape(error.message || 'Meta bağlantısını yeniden başlatın.')}</span><button type="button" class="rb-button primary" onclick="rbCloseCompanyModal();rbConnectMeta()">Yeniden bağlan</button></div>`;
    }
}

async function rbSelectMetaAccount(companyId, igUserId, button) {
    if (button) { button.disabled = true; button.classList.add('loading'); }
    try {
        const response = await fetch(`/api/meta/select-account?companyId=${encodeURIComponent(companyId)}&igUserId=${encodeURIComponent(igUserId)}`, { method: 'POST', credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Instagram hesabı bağlanamadı.');
        const connections = rbMetaConnections();
        connections[companyId] = { username: data.username || '', pageId: data.pageId || '', igUserId: data.igUserId || '', adsRead: data.adsRead === true, insightsRead: data.insightsRead === true, connectedAt: new Date().toISOString() };
        localStorage.setItem('rdgrup-panel-meta-connections', JSON.stringify(connections));
        rbState = rbLoadState(companyId, rbState?.period || rbCurrentPeriod());
        renderReportBuilderPage();
        rbOpenCompanyModal(companyId);
        alert(`@${data.username || 'Instagram'} hesabı seçili firmaya bağlandı.`);
    } catch (error) {
        if (button) { button.disabled = false; button.classList.remove('loading'); }
        alert(error.message || 'Instagram hesabı bağlanamadı.');
    }
}

async function rbDisconnectMeta() {
    return rbDisconnectMetaForCompany(rbState?.companyId || '');
}

async function rbDisconnectMetaForCompany(companyId) {
    if (!companyId) return;
    try { if (rbIsOnlineMetaEnvironment()) await fetch(`/api/meta/disconnect?companyId=${encodeURIComponent(companyId)}`, { credentials: 'same-origin' }); } catch (_) {}
    const connections = rbMetaConnections(); delete connections[companyId];
    localStorage.setItem('rdgrup-panel-meta-connections', JSON.stringify(connections));
    if (rbState?.companyId === companyId) {
        rbState.metaAdAccountsLoaded = false; rbState.metaAdAccounts = []; rbState.adAccountId = ''; rbState.metaAds = [];
    }
    renderReportBuilderPage();
    rbOpenCompanyModal(companyId);
}

function rbStoreStateLocally() {
    if (!rbState?.companyId || !rbState?.period) return;
    localStorage.setItem(rbStorageKey(rbState.companyId, rbState.period), JSON.stringify(rbState));
    rbRememberContext(rbState.companyId, rbState.period);
}

async function rbMetaJson(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 20000);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetch(url, { credentials: 'same-origin', ...(controller ? { signal: controller.signal } : {}) });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; }
        catch (_) { throw Object.assign(new Error('Sunucudan geçersiz yanıt alındı. Vercel yayınının tamamlandığından emin olun.'), { status: response.status }); }
        if (!response.ok) throw Object.assign(new Error(data.error || 'Meta verisi alınamadı.'), { status: response.status, data });
        return data;
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error('Meta isteği zaman aşımına uğradı. Diğer veriler korunarak reklam bölümü atlandı.');
        throw error;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function rbImportMetaContents() {
    if (!rbMetaConnection()) return rbConnectMeta();
    if (!rbIsOnlineMetaEnvironment()) return alert('Meta verileri çevrim içi GitHub/Vercel panelinden alınabilir.');
    const [year, month] = rbState.period.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const since = `${rbState.period}-01`;
    const until = `${rbState.period}-${String(lastDay).padStart(2, '0')}`;
    const companyId = encodeURIComponent(rbState.companyId);
    const [periodResult, latestResult, insightsResult] = await Promise.allSettled([
        rbMetaJson(`/api/meta/media?companyId=${companyId}&since=${since}&until=${until}&includeInsights=1`, { timeoutMs: 30000 }),
        rbMetaJson(`/api/meta/media?companyId=${companyId}&latest=12`),
        rbMetaJson(`/api/meta/insights?companyId=${companyId}&since=${since}&until=${until}`)
    ]);
    const warnings = [];
    let periodData = null;
    let latestData = null;
    let insightsData = null;
    if (periodResult.status === 'fulfilled') {
        periodData = periodResult.value;
        rbState.contents = (periodData.media || []).map(item => ({ id: item.id || rbUid(), date: item.date || '', type: item.type === 'Reels' ? 'Reels' : 'Gönderi' }));
        rbState.topContents = rbBuildTopContents(periodData.media || []);
    } else warnings.push(`Aylık gönderiler: ${periodResult.reason?.message || 'alınamadı'}`);
    if (latestResult.status === 'fulfilled') {
        latestData = latestResult.value;
        rbState.profilePosts = latestData.media || [];
        rbState.metaProfile = { ...(latestData.profile || {}), username: latestData.username || '' };
        if (latestData.profile?.followersCount != null) rbState.followers = String(latestData.profile.followersCount);
    } else warnings.push(`Hesap görünümü: ${latestResult.reason?.message || 'alınamadı'}`);
    if (insightsResult.status === 'fulfilled') {
        insightsData = insightsResult.value;
        ['views','reach','profileVisits','likes','comments','saves','shares'].forEach(key => {
            if (insightsData[key] != null) rbState[key] = String(insightsData[key]);
        });
    } else {
        warnings.push(`Organik istatistikler: ${insightsResult.reason?.message || 'alınamadı'}`);
        if ([401, 403].includes(Number(insightsResult.reason?.status))) {
            const connections = rbMetaConnections();
            if (connections[rbState.companyId]) connections[rbState.companyId].insightsRead = false;
            localStorage.setItem('rdgrup-panel-meta-connections', JSON.stringify(connections));
        }
    }

    // Gönderiler ve organik istatistikler reklam servisini beklemeden ekrana ve taslağa yazılır.
    rbStoreStateLocally();
    renderReportBuilderPage();

    let adsImported = false;
    let archiveMatchedAdCoverCount = 0;
    if (rbMetaConnection()?.adsRead !== false) {
        try {
            rbState.metaAdAccountsLoaded = false;
            await rbLoadMetaAdAccounts(false);
            if (rbState.adAccountId) {
                const adsUrl = `/api/meta/ads?companyId=${companyId}&adAccountId=${encodeURIComponent(rbState.adAccountId)}&since=${since}&until=${until}`;
                const adsData = await rbMetaJson(adsUrl, { timeoutMs: 15000 });
                rbState.adSpend = adsData.spend || '0';
                rbState.adImpressions = adsData.impressions || '0';
                rbState.adReach = adsData.reach || '0';
                rbState.adClicks = adsData.clicks || '0';
                rbState.adCurrency = adsData.currency || 'TRY';
                const mediaRows = [...(periodData?.media || []), ...(latestData?.media || []), ...(rbState.profilePosts || [])];
                rbState.metaAds = rbFillAdThumbnailsFromMedia(Array.isArray(adsData.ads) ? adsData.ads : [], mediaRows);
                if (adsData.profileVisits && insightsData?.profileVisits == null) rbState.profileVisits = adsData.profileVisits;
                adsImported = true;
                // Reklam sonuçları hızlıca gösterilir; creative kapakları ikinci ve bağımsız istekte tamamlanır.
                rbStoreStateLocally();
                renderReportBuilderPage();
                if (rbState.metaAds.some(ad => !rbAdImageSources(ad).length)) {
                    try {
                        const detailedAdsData = await rbMetaJson(`${adsUrl}&includeImages=1`, { timeoutMs: 30000 });
                        const currentById = new Map(rbState.metaAds.map(ad => [String(ad.id || ''), ad]));
                        const mergedAds = (detailedAdsData.ads || []).map(ad => ({ ...currentById.get(String(ad.id || '')), ...ad }));
                        rbState.metaAds = rbFillAdThumbnailsFromMedia(mergedAds, mediaRows);
                    } catch (error) { warnings.push(`Reklam kapakları: ${error.message || 'alınamadı'}`); }
                }
                if (rbState.metaAds.some(ad => !rbAdImageSources(ad).length)) {
                    try {
                        const archiveData = await rbMetaJson(`/api/meta/media?companyId=${companyId}&history=300`, { timeoutMs: 30000 });
                        const missingAds = rbState.metaAds.filter(ad => !rbAdImageSources(ad).length);
                        const archiveMatches = rbFillAdThumbnailsFromMedia(missingAds, archiveData.media || []);
                        const archiveById = new Map(archiveMatches.map(ad => [String(ad.id || ''), ad]));
                        rbState.metaAds = rbState.metaAds.map(ad => {
                            if (rbAdImageSources(ad).length) return ad;
                            const matched = archiveById.get(String(ad.id || ''));
                            if (!matched || !rbAdImageSources(matched).length) return ad;
                            archiveMatchedAdCoverCount += 1;
                            return { ...matched, thumbnailArchiveMatch: true };
                        });
                    } catch (error) { warnings.push(`Eski gönderi arşivi: ${error.message || 'taranamadı'}`); }
                }
            } else if (!rbState.metaAdAccounts.length) {
                warnings.push('Reklamlar: Erişilebilen reklam hesabı bulunamadı; firma Meta bağlantısını yeniden yapın.');
            } else {
                warnings.push('Reklamlar: Firmaları Düzenle bölümünden reklam hesabını seçin.');
            }
        } catch (error) { warnings.push(`Reklamlar: ${error.message || 'alınamadı'}`); }
    } else warnings.push('Reklamlar: Meta bağlantısında ads_read izni bulunmuyor; firmayı yeniden bağlayın.');

    rbStoreStateLocally();
    renderReportBuilderPage();
    const ads = Array.isArray(rbState.metaAds) ? rbState.metaAds : [];
    const adCoverCount = ads.filter(ad => rbAdImageSources(ad).length).length;
    const matchedAdCoverCount = ads.filter(ad => String(ad.thumbnailSource || '').startsWith('instagram-media')).length;
    const dateMatchedAdCoverCount = ads.filter(ad => ad.thumbnailSource === 'instagram-media-date').length;
    const descriptionMatchedAdCoverCount = ads.filter(ad => ad.thumbnailSource === 'instagram-media-description').length;
    const matchDetails = [descriptionMatchedAdCoverCount ? `${descriptionMatchedAdCoverCount} açıklama` : '', archiveMatchedAdCoverCount ? `${archiveMatchedAdCoverCount} eski gönderi arşivi` : '', dateMatchedAdCoverCount ? `${dateMatchedAdCoverCount} tarih` : ''].filter(Boolean).join(', ');
    const adMessage = adsImported ? ` ${ads.length} reklamın ayrı sonucu ve ${adCoverCount} kapak adayı eklendi; ${matchedAdCoverCount} tanesi Instagram gönderisiyle eşleşti${matchDetails ? ` (${matchDetails} eşleşmesi)` : ''}.` : (rbState.metaAdAccounts.length > 1 && !rbState.adAccountId ? ' Reklamlar için Firmaları Düzenle bölümünden reklam hesabını bir kez seçin.' : '');
    const topContentMessage = rbState.topContents.length ? ` En iyi ${rbState.topContents.length} içerik gönderi istatistiklerine göre seçildi.` : '';
    const insightMessage = insightsData?.hasData !== false && insightsData ? ` Organik istatistikler de güncellendi.${topContentMessage}` : (insightsData ? ` Seçilen dönem için Meta organik istatistik verisi bulunamadı.${topContentMessage}` : ` Var olan organik istatistikler korundu.${topContentMessage}`);
    const warningMessage = warnings.length ? `\n\nAlınamayan bölümler:\n- ${warnings.join('\n- ')}` : '';
    alert(`${rbState.contents.length} aylık paylaşım ve son ${rbState.profilePosts.length} gönderi raporda hazır.${insightMessage}${adMessage}${warningMessage}`);
}

async function rbLoadMetaAdAccounts(rerender = true) {
    if (!rbState?.companyId || !rbIsOnlineMetaEnvironment() || rbState.metaAdAccountsLoaded) return rbState?.metaAdAccounts || [];
    try {
        const response = await fetch(`/api/meta/ad-accounts?companyId=${encodeURIComponent(rbState.companyId)}`, { credentials: 'same-origin' });
        const data = await response.json();
        rbState.metaAdAccountsLoaded = true;
        rbState.metaAdAccounts = response.ok && Array.isArray(data.accounts) ? data.accounts : [];
        const accountIds = new Set(rbState.metaAdAccounts.map(account => String(account.accountId || '')));
        const configuredAccountId = String(rbCompany().reportAdAccountId || '');
        if (!accountIds.has(String(rbState.adAccountId || ''))) rbState.adAccountId = '';
        if (!rbState.adAccountId && accountIds.has(configuredAccountId)) rbState.adAccountId = configuredAccountId;
        if (!rbState.adAccountId && rbState.metaAdAccounts.length === 1) rbState.adAccountId = rbState.metaAdAccounts[0].accountId;
        if (rerender) renderReportBuilderPage();
        return rbState.metaAdAccounts;
    } catch (_) {
        rbState.metaAdAccountsLoaded = true;
        rbState.metaAdAccounts = [];
        if (rerender) renderReportBuilderPage();
        return [];
    }
}

function rbPeriodLabel(period = rbState?.period) {
    const [year, month] = String(period || rbCurrentPeriod()).split('-');
    return `${rbMonthNames[Math.max(0, Number(month) - 1)]} ${year}`;
}

function rbFormatNumber(value) {
    const parsed = Number(String(value || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? new Intl.NumberFormat('tr-TR').format(parsed) : '—';
}

function rbFormatMoney(value, currency = 'TRY') {
    const parsed = Number(String(value || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return '—';
    try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(parsed); }
    catch (_) { return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(parsed)} ₺`; }
}

function rbAdSpendWithVat(value) {
    const parsed = Number(String(value || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed * (1 + rbAdVatRate) : value;
}

function rbFormatAdSpend(value, currency = 'TRY') {
    return rbFormatMoney(rbAdSpendWithVat(value), currency);
}

function rbComparableText(value) {
    return String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/instagram\s+gonderisi\s*:?/g, '').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
}

function rbImageSources(...values) {
    return [...new Set(values.flat(Infinity).map(value => String(value || '').trim()).filter(Boolean))];
}

function rbImageMarkup(sources, alt, className = '') {
    const urls = rbImageSources(sources);
    if (!urls.length) return '';
    const fallbacks = encodeURIComponent(JSON.stringify(urls.slice(1)));
    return `<img src="${rbEscape(urls[0])}" data-rb-fallbacks="${fallbacks}" alt="${rbEscape(alt)}"${className ? ` class="${rbEscape(className)}"` : ''} onerror="rbUseNextImage(this)">`;
}

function rbUseNextImage(image) {
    let remaining = [];
    try { remaining = JSON.parse(decodeURIComponent(image.dataset.rbFallbacks || '%5B%5D')); } catch (_) {}
    const next = remaining.shift();
    if (!next) { image.remove(); return; }
    image.dataset.rbFallbacks = encodeURIComponent(JSON.stringify(remaining));
    image.src = next;
}

function rbTextMatchScore(left, right) {
    const ignored = new Set(['instagram','gonderisi','gönderisi','reklam','reklami','reklamı','gonderi','gönderi','video','reels']);
    const words = value => rbComparableText(value).split(' ').filter(word => word.length > 2 && !ignored.has(word));
    const leftWords = words(left); const rightWords = words(right);
    if (!leftWords.length || !rightWords.length) return 0;
    const rightSet = new Set(rightWords);
    const common = leftWords.filter(word => rightSet.has(word)).length;
    return common >= 2 ? common / Math.min(leftWords.length, rightWords.length) : 0;
}

function rbAdDescriptions(ad) {
    return rbImageSources(ad?.description, ad?.descriptionCandidates);
}

function rbDescriptionMatchScore(left, right) {
    const leftText = rbComparableText(left);
    const rightText = rbComparableText(right);
    if (!leftText || !rightText) return 0;
    const shortestLength = Math.min(leftText.length, rightText.length);
    if (leftText === rightText) return 1;
    if (shortestLength >= 18 && (leftText.includes(rightText) || rightText.includes(leftText))) return .99;
    const ignored = new Set(['icin','için','ile','bir','bu','ve','veya','daha','olan','olarak','instagram','gonderisi','gönderisi','reklam']);
    const words = value => [...new Set(rbComparableText(value).split(' ').filter(word => word.length > 2 && !ignored.has(word)))];
    const leftWords = words(leftText); const rightWords = words(rightText);
    if (!leftWords.length || !rightWords.length) return 0;
    const rightSet = new Set(rightWords);
    const common = leftWords.filter(word => rightSet.has(word)).length;
    if (common < 3) return 0;
    const coverage = common / Math.min(leftWords.length, rightWords.length);
    const union = new Set([...leftWords, ...rightWords]).size;
    const jaccard = union ? common / union : 0;
    return coverage * .8 + jaccard * .2;
}

function rbMediaMatchByDescription(ad, mediaRows) {
    const descriptions = rbAdDescriptions(ad);
    if (!descriptions.length) return null;
    return mediaRows.map(media => ({
        media,
        score: Math.max(...descriptions.map(description => rbDescriptionMatchScore(description, media.caption)))
    })).sort((left, right) => right.score - left.score).find(candidate => candidate.score >= .62)?.media || null;
}

function rbDateValue(value) {
    const matched = String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    const parsed = matched ? new Date(`${matched}T12:00:00Z`).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

function rbMediaMatchByDate(ad, mediaRows) {
    const adDate = rbDateValue(ad.publishedTime || ad.createdTime || ad.updatedTime);
    if (adDate == null) return null;
    const labels = [ad.name, ad.campaignName, ad.adsetName].filter(Boolean);
    const candidates = mediaRows.map(media => {
        const mediaDate = rbDateValue(media.date || media.timestamp);
        if (mediaDate == null) return null;
        const dayDifference = Math.abs(mediaDate - adDate) / 86400000;
        const textScore = labels.length ? Math.max(...labels.map(label => rbTextMatchScore(label, media.caption))) : 0;
        return { media, dayDifference, textScore };
    }).filter(Boolean).filter(candidate => candidate.dayDifference <= 7)
        .sort((left, right) => left.dayDifference - right.dayDifference || right.textScore - left.textScore);
    const exactDay = candidates.filter(candidate => candidate.dayDifference === 0);
    if (exactDay.length === 1) return exactDay[0].media;
    if (exactDay.length > 1) return exactDay.sort((left, right) => right.textScore - left.textScore)[0].media;
    if (candidates[0] && (candidates.length === 1 || candidates[0].textScore >= .25)) return candidates[0].media;
    return null;
}

function rbFillAdThumbnailsFromMedia(ads, mediaRows) {
    return ads.map(ad => {
        const byId = mediaRows.find(media => String(media.id || '') === String(ad.instagramMediaId || ''));
        let match = byId;
        let matchSource = byId ? 'instagram-media-id' : '';
        if (!match) {
            match = rbMediaMatchByDescription(ad, mediaRows);
            if (match) matchSource = 'instagram-media-description';
        }
        if (!match) {
            const adText = rbComparableText(ad.name);
            match = mediaRows.find(media => {
                const caption = rbComparableText(media.caption);
                if (!adText || !caption) return false;
                const captionLead = caption.slice(0, Math.min(48, caption.length));
                const adLead = adText.slice(0, Math.min(48, adText.length));
                return captionLead.length >= 18 && (adText.includes(captionLead) || caption.includes(adLead));
            });
            if (match) matchSource = 'instagram-media-name';
        }
        if (!match) {
            const adLabels = [ad.name, ad.campaignName, ad.adsetName].filter(Boolean);
            match = mediaRows.map(media => ({ media, score: Math.max(...adLabels.map(label => rbTextMatchScore(label, media.caption))) }))
                .sort((left, right) => right.score - left.score)
                .find(candidate => candidate.score >= .55)?.media;
            if (match) matchSource = 'instagram-media-name';
        }
        // Meta gerçek reklam açıklamasını verdiyse tarih eşleştirmesi yapılmaz; yanlış kapak riskini önler.
        if (!match && !rbAdDescriptions(ad).length) {
            match = rbMediaMatchByDate(ad, mediaRows);
            if (match) matchSource = 'instagram-media-date';
        }
        const mediaSources = match ? rbImageSources(match.thumbnailUrl, match.thumbnailFallbackUrl, match.mediaUrl) : [];
        const creativeSources = rbImageSources(ad.thumbnailUrl, ad.thumbnailFallbackUrl, ad.creativeThumbnailUrl);
        const sources = rbImageSources(mediaSources, creativeSources);
        return { ...ad, thumbnailUrl: sources[0] || '', thumbnailFallbackUrls: sources.slice(1), thumbnailSource: mediaSources.length ? matchSource : (ad.thumbnailSource || '') };
    });
}

function rbAdImageSources(ad) {
    return rbImageSources(ad?.thumbnailUrl, ad?.thumbnailFallbackUrls, ad?.thumbnailFallbackUrl, ad?.creativeThumbnailUrl);
}

function rbBuildTopContents(mediaRows) {
    return (mediaRows || []).map(media => {
        const insight = media.insights || {};
        const reach = Number(insight.reach) || 0;
        const views = Number(insight.views) || 0;
        const interactions = Number(insight.interactions) || ['likes','comments','saves','shares'].reduce((sum, key) => sum + (Number(insight[key]) || 0), 0);
        return {
            id: media.id || '',
            type: media.type || 'Gönderi',
            caption: media.caption || '',
            permalink: media.permalink || '',
            thumbnailUrl: media.thumbnailUrl || '',
            thumbnailFallbackUrl: media.thumbnailFallbackUrl || '',
            reach,
            views,
            interactions,
            score: reach || views || interactions,
        };
    }).filter(item => item.score > 0 || item.interactions > 0)
        .sort((left, right) => right.score - left.score || right.interactions - left.interactions)
        .slice(0, 3);
}

function rbAdDetailCards() {
    const ads = Array.isArray(rbState?.metaAds) ? rbState.metaAds : [];
    if (!ads.length) return '<div class="rb-ad-empty"><i class="fa-regular fa-images"></i><span>Meta’dan verileri getirdiğinizde her reklamın kapağı ve sonuçları burada görünür.</span></div>';
    return `<div class="rb-ad-list">${ads.map(ad => `<article class="rb-ad-card"><div class="rb-ad-thumb"><div class="rb-ad-image-fallback"><i class="fa-solid fa-photo-film"></i><span>Kapak alınamadı</span></div>${rbImageMarkup(rbAdImageSources(ad), `${ad.name || 'Reklam'} kapak görseli`)}</div><div class="rb-ad-copy"><small>${rbEscape(ad.campaignName || 'Meta reklam kampanyası')}</small><strong>${rbEscape(ad.name || 'İsimsiz reklam')}</strong><span>${rbEscape(ad.adsetName || '')}</span><div><p><b>${rbEscape(rbFormatAdSpend(ad.spend, ad.currency))}</b><small>Harcama · KDV dahil</small></p><p><b>${rbEscape(rbFormatNumber(ad.reach))}</b><small>Erişim</small></p><p><b>${rbEscape(rbFormatNumber(ad.impressions))}</b><small>Gösterim</small></p><p><b>${rbEscape(rbFormatNumber(ad.clicks))}</b><small>Tıklama</small></p></div></div></article>`).join('')}</div>`;
}

function rbFormatDate(value) {
    if (!value) return 'Tarih girilmedi';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

function rbEnsureState() {
    const firstCompany = dbReportCompanies[0];
    if (!firstCompany) { rbState = rbEmptyState('', rbCurrentPeriod()); return; }
    const companyExists = rbState && dbReportCompanies.some(item => item.docId === rbState.companyId);
    if (!companyExists) rbState = rbLoadState(firstCompany.docId, rbPreferredPeriod(firstCompany.docId));
}

function renderReportBuilderPage() {
    rbEnsureState();
    rbReadMetaRedirect();
    const company = rbCompany();
    const metaConnection = rbMetaConnection();
    if (!rbState.adAccountId && company.reportAdAccountId) rbState.adAccountId = company.reportAdAccountId;
    const companyOptions = dbReportCompanies.map(item => `<option value="${rbEscape(item.docId)}" ${item.docId === rbState.companyId ? 'selected' : ''}>${rbEscape(item.name || 'İsimsiz Firma')}</option>`).join('');
    const contentRows = rbState.contents.length ? [...rbState.contents].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(item => `
        <div class="rb-content-row">
            <input type="date" value="${rbEscape(item.date)}" onchange="rbUpdateContent('${rbEscape(item.id)}','date',this.value)">
            <select onchange="rbUpdateContent('${rbEscape(item.id)}','type',this.value)"><option ${item.type === 'Reels' ? 'selected' : ''}>Reels</option><option ${item.type === 'Gönderi' ? 'selected' : ''}>Gönderi</option></select>
            <span>${rbEscape(item.type)} ve Story Paylaşımı</span>
            <button type="button" onclick="rbRemoveContent('${rbEscape(item.id)}')" aria-label="Paylaşımı sil">×</button>
        </div>`).join('') : '<div class="rb-empty">Henüz paylaşım eklenmedi. Paneldeki paylaşım takviminden otomatik getirebilirsin.</div>';

    document.getElementById('main-content').innerHTML = `
        <div class="rb-page">
            <header class="rb-topbar">
                <div><span>RDGRUP MEDYA</span><h2>Rapor Oluştur</h2><p>Firma ekle, aylık verileri tamamla ve müşteriye hazır PDF oluştur.</p></div>
                <div class="rb-top-actions"><button type="button" class="rb-button company" onclick="rbOpenCompanyManager()"><i class="fa-solid fa-building-pen"></i> Firmaları Düzenle</button><button type="button" class="rb-button secondary" onclick="rbSaveDraft()"><i class="fa-regular fa-floppy-disk"></i> Taslağı kaydet</button><button type="button" class="rb-button primary" onclick="rbOpenPreview()"><i class="fa-regular fa-file-pdf"></i> Önizle / PDF</button></div>
            </header>

            ${dbReportCompanies.length ? '' : '<div class="rb-warning">Henüz rapor firması yok. Üstteki “Firmaları Düzenle” bölümünden ilk firmayı ekleyin.</div>'}
            <div class="rb-layout">
                <section class="rb-form-column">
                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>01</b><div><h3>Rapor bilgileri</h3><p>Firma, dönem ve rapor rengini belirle.</p></div></div>
                        <div class="rb-fields four">
                            <label>Firma<select id="rb-company" onchange="rbSwitchContext()">${companyOptions || '<option value="">Firma yok</option>'}</select></label>
                            <label>Rapor dönemi<input id="rb-period" type="month" value="${rbEscape(rbState.period)}" onchange="rbSwitchContext()"></label>
                            <label>Rapor rengi<div class="rb-color"><input type="color" value="${rbEscape(rbState.accent)}" oninput="rbSetField('accent',this.value)"><span>${rbEscape(rbState.accent.toUpperCase())}</span></div></label>
                            <label>Firma logosu<input id="rb-current-logo-file" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onchange="rbUpdateCompanyLogo(event)" hidden><button type="button" class="rb-logo-upload" onclick="document.getElementById('rb-current-logo-file').click()" ${company.docId ? '' : 'disabled'}>${company.reportLogo || company.logo ? `<span>${rbCompanyLogo(company)}</span><b>Logoyu değiştir</b>` : '<i class="fa-regular fa-image"></i><b>Bilgisayardan seç</b>'}</button></label>
                        </div>
                        <div class="rb-meta-card ${metaConnection ? 'connected' : ''}"><div class="rb-meta-icon"><i class="fa-brands fa-meta"></i></div><div><strong>${metaConnection ? `@${rbEscape(metaConnection.username || company.instagram || 'Instagram')} firma ayarlarında eşleştirildi` : 'Bu firma henüz Meta hesabına eşleştirilmedi'}</strong><span>${metaConnection ? `Rapor verileri ve ayın en iyi 3 içeriği tek düğmeyle alınır${company.reportAdAccountId ? '; reklam hesabı da hazırdır.' : '.'}` : 'Firmaları Düzenle bölümünden doğru Instagram hesabını bir kez seçin.'}</span>${metaConnection?.insightsRead === false ? '<em>Organik istatistik izni eksik. Firma ayarlarından hesabı yeniden bağlayın.</em>' : ''}${metaConnection?.adsRead === false ? '<em>Reklam okuma izni verilmedi; diğer Instagram verileri yine alınabilir.</em>' : ''}</div><div class="rb-meta-actions">${metaConnection ? '<button type="button" onclick="rbImportMetaContents()"><i class="fa-solid fa-rotate"></i> Meta’dan verileri getir</button>' : `<button type="button" onclick="rbOpenCompanyModal('${rbEscape(company.docId || '')}')"><i class="fa-solid fa-building-pen"></i> Firma ayarlarını aç</button>`}</div></div>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>02</b><div><h3>Instagram paylaşımları</h3><p>Takvimde tamamlanan paylaşımları getir veya elle ekle.</p></div><div class="rb-panel-actions"><button type="button" onclick="rbImportPanelContents()">Panelden getir</button><button type="button" onclick="rbAddContent()">+ Ekle</button></div></div>
                        <div class="rb-story-field"><label>Bu ay toplam Story<input type="number" min="0" value="${rbEscape(rbState.storyCount)}" oninput="rbSetField('storyCount',this.value)"></label><span>Gönderi listesinde her içerik “ve Story Paylaşımı” şeklinde gösterilir.</span></div>
                        <div class="rb-content-list">${contentRows}</div>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>03</b><div><h3>Hesabın görünümü</h3><p>Son 12 gönderi Meta’dan otomatik çekilir ve PDF’de 3 sütun × 4 satır gösterilir.</p></div></div>
                        <label class="rb-upload"><input type="file" accept="image/*" onchange="rbSetProfileImage(event)" hidden>${rbState.profileImage ? `<img src="${rbEscape(rbState.profileImage)}" alt="Profil önizlemesi"><span>Görseli değiştir</span>` : '<i class="fa-brands fa-meta"></i><strong>Meta’dan otomatik çekilir</strong><span>İstersen özel bir ekran görüntüsü de yükleyebilirsin</span>'}</label>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>04</b><div><h3>Erişim istatistikleri</h3><p>Aylık organik sonuçlar Meta’dan otomatik gelir; gerekirse düzenleyebilirsin.</p></div></div>
                        <div class="rb-fields metrics">${rbMetricInput('views','Toplam görüntüleme')}${rbMetricInput('reach','Erişilen hesap')}${rbMetricInput('profileVisits','Profil ziyareti')}${rbMetricInput('followers','Takipçi sayısı')}</div>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>05</b><div><h3>Etkileşim istatistikleri</h3><p>Beğeni, yorum, kaydetme ve paylaşım Meta’dan otomatik gelir.</p></div></div>
                        <div class="rb-fields metrics">${rbMetricInput('likes','Beğeni')}${rbMetricInput('comments','Yorum')}${rbMetricInput('saves','Kaydetme')}${rbMetricInput('shares','Paylaşım')}</div>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>06</b><div><h3>Meta reklamları</h3><p>Her reklamın kapak görseli ve kendi sonucu; ardından hesap toplamı.</p></div></div>
                        <div class="rb-fields metrics">${rbMetricInput('adSpend','Meta harcaması (KDV hariç)')}${rbMetricInput('adImpressions','Gösterim')}${rbMetricInput('adReach','Reklam erişimi')}${rbMetricInput('adClicks','Tıklama')}</div>
                        ${rbAdDetailCards()}
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>07</b><div><h3>Aylık değerlendirme</h3><p>Müşteriye iletilecek kısa not ve öneriler.</p></div></div>
                        <textarea class="rb-notes" rows="5" placeholder="Bu ay öne çıkan sonuçlar ve gelecek ay önerileri..." oninput="rbSetField('notes',this.value)">${rbEscape(rbState.notes)}</textarea>
                    </article>
                </section>

                <aside class="rb-summary">
                    <div class="rb-summary-card" style="--rb-accent:${rbEscape(rbState.accent)}">
                        <span class="rb-summary-label">CANLI ÖZET</span><div class="rb-summary-logo">${rbCompanyLogo(company)}</div><h3>${rbEscape(company.name || 'Firma seçilmedi')}</h3><p>${rbEscape(rbPeriodLabel())} Raporu</p>
                        <div class="rb-summary-numbers"><div><span>İçerik</span><b>${rbState.contents.length}</b></div><div><span>Story</span><b>${rbFormatNumber(rbState.storyCount)}</b></div><div><span>Erişim</span><b>${rbFormatNumber(rbState.reach)}</b></div></div>
                        <button type="button" class="rb-button primary" onclick="rbOpenPreview()">Raporu önizle <i class="fa-solid fa-arrow-right"></i></button>
                    </div>
                </aside>
            </div>
        </div>`;
}

function rbMetricInput(key, label) {
    return `<label>${label}<input inputmode="numeric" value="${rbEscape(rbState[key])}" placeholder="0" oninput="rbSetField('${key}',this.value)"></label>`;
}

function rbCompanyLogo(company) {
    if (company.reportLogo) {
        if (company.reportLogoTint !== false) return rbTintedLogoMarkup(company.reportLogo, `${company.name || 'Firma'} logosu`);
        return `<img src="${rbEscape(company.reportLogo)}" alt="${rbEscape(company.name || 'Firma')} logosu">`;
    }
    const logo = company.logo || rbState?.metaProfile?.profilePictureUrl || '';
    if (logo) return `<img src="${rbEscape(logo)}" alt="${rbEscape(company.name || 'Firma')} logosu">`;
    const initials = String(company.name || 'RD').split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();
    return `<span>${rbEscape(initials || 'RD')}</span>`;
}

function rbTintedLogoMarkup(logo, label = 'Firma logosu') {
    return `<span class="rb-tinted-logo" role="img" aria-label="${rbEscape(label)}" style="--rb-logo-source:url(&quot;${rbEscape(logo)}&quot;)"></span>`;
}

function rbSetField(key, value) {
    if (!rbState) return;
    rbState[key] = value;
    if (key === 'accent') {
        const colorText = document.querySelector('.rb-color span');
        if (colorText) colorText.textContent = value.toUpperCase();
        const card = document.querySelector('.rb-summary-card');
        if (card) card.style.setProperty('--rb-accent', value);
    }
}

function rbSwitchContext() {
    const companyId = document.getElementById('rb-company')?.value || '';
    const period = document.getElementById('rb-period')?.value || rbCurrentPeriod();
    rbState = rbLoadState(companyId, period);
    rbRememberContext(companyId, period);
    renderReportBuilderPage();
}

function rbUid() {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function rbAddContent() {
    if (!rbState) return;
    rbState.contents.push({ id: rbUid(), date: `${rbState.period}-01`, type: 'Reels' });
    renderReportBuilderPage();
}

function rbUpdateContent(id, key, value) {
    const item = rbState.contents.find(content => content.id === id);
    if (item) item[key] = value;
}

function rbRemoveContent(id) {
    rbState.contents = rbState.contents.filter(content => content.id !== id);
    renderReportBuilderPage();
}

function rbImportPanelContents() {
    const company = rbCompany();
    if (!company.docId) return alert('Önce firma seçin.');
    const imported = [];
    dbTasks.filter(task => normalizeStr(task.firma) === normalizeStr(company.name) && String(task.tarih || '').startsWith(rbState.period) && task.paylasildi === true).sort((a, b) => String(a.tarih).localeCompare(String(b.tarih))).forEach(task => {
        const count = Math.max(1, Number(task.adet) || 1);
        for (let index = 0; index < count; index++) imported.push({ id: rbUid(), date: task.tarih, type: task.tur === 'Video' ? 'Reels' : 'Gönderi' });
    });
    rbState.contents = imported;
    renderReportBuilderPage();
    alert(imported.length ? `${imported.length} paylaşım rapora aktarıldı.` : 'Seçilen firma ve ay için tamamlanmış paylaşım bulunamadı.');
}

async function rbSaveCompany(connectAfterSave = false) {
    const name = document.getElementById('rb-new-name')?.value.trim();
    if (!name) return alert('Firma adını girin.');
    const normalizedName = typeof normalizeStr === 'function' ? normalizeStr(name) : name.toLocaleLowerCase('tr-TR');
    const existing = dbReportCompanies.find(item => item.docId !== rbEditingCompanyId && (typeof normalizeStr === 'function' ? normalizeStr(item.name) : String(item.name || '').toLocaleLowerCase('tr-TR')) === normalizedName);
    if (existing) {
        rbState = rbLoadState(existing.docId, rbState?.period || rbCurrentPeriod());
        rbCloseCompanyModal();
        renderReportBuilderPage();
        if (connectAfterSave) return rbConnectMetaForCompany(existing.docId);
        return alert('Bu firma zaten sistemde kayıtlı. Mevcut firma rapora seçildi; logosunu Rapor Bilgileri alanından değiştirebilirsiniz.');
    }
    const saveButton = document.getElementById('rb-company-save');
    const connectButton = document.getElementById('rb-company-save-connect');
    if (saveButton) { saveButton.disabled = true; saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor'; }
    if (connectButton) connectButton.disabled = true;
    const editedCompany = dbReportCompanies.find(item => item.docId === rbEditingCompanyId) || {};
    const data = {
        name,
        instagram: document.getElementById('rb-new-instagram')?.value.trim() || '',
        reportLogo: rbPendingCompanyLogo,
        reportLogoTint: document.getElementById('rb-new-logo-tint')?.checked !== false,
        reportColor: document.getElementById('rb-new-color')?.value || '#6c63ff',
        reportAdAccountId: document.getElementById('rb-company-ad-account')?.value || editedCompany.reportAdAccountId || '',
        updatedAt: new Date().toISOString(),
        createdFrom: 'report-builder-v2'
    };
    try {
        let companyId = rbEditingCompanyId;
        if (companyId) {
            await db.collection('report_companies').doc(companyId).set(data, { merge: true });
        } else {
            const result = await db.collection('report_companies').add({ ...data, order: dbReportCompanies.length, createdAt: new Date().toISOString() });
            companyId = result.id;
        }
        const wasEditing = Boolean(rbEditingCompanyId);
        await fetchReportCompaniesFromFirebase();
        rbState = rbLoadState(companyId, rbState?.period || rbCurrentPeriod());
        rbCloseCompanyModal();
        renderReportBuilderPage();
        if (connectAfterSave) return rbConnectMetaForCompany(companyId);
        alert(wasEditing ? 'Rapor firması güncellendi.' : 'Firma yalnızca rapor sistemine kaydedildi ve seçildi.');
    } catch (error) {
        console.error(error);
        if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = '<i class="fa-solid fa-check"></i> Firmayı Kaydet'; }
        if (connectButton) connectButton.disabled = false;
        alert('Rapor firması kaydedilemedi. Firebase yetkilerini kontrol edin.');
    }
}

function rbManagerCompanyLogo(company) {
    if (company.reportLogo) {
        if (company.reportLogoTint !== false) return rbTintedLogoMarkup(company.reportLogo, `${company.name || 'Firma'} logosu`);
        return `<img src="${rbEscape(company.reportLogo)}" alt="${rbEscape(company.name || 'Firma')} logosu">`;
    }
    if (company.logo) return `<img src="${rbEscape(company.logo)}" alt="${rbEscape(company.name || 'Firma')} logosu">`;
    const initials = String(company.name || 'RF').split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();
    return `<span>${rbEscape(initials || 'RF')}</span>`;
}

function rbOpenCompanyManager() {
    rbCloseCompanyModal();
    const rows = dbReportCompanies.length ? dbReportCompanies.map(company => { const connection = rbMetaConnectionFor(company.docId); return `<div class="rb-company-manager-row"><div class="rb-company-manager-logo" style="color:${rbEscape(company.reportColor || company.color || '#6c63ff')}">${rbManagerCompanyLogo(company)}</div><div><strong>${rbEscape(company.name || 'İsimsiz Firma')}</strong><span>${rbEscape(company.instagram || 'Instagram hesabı eklenmedi')}</span><small class="rb-company-meta-badge ${connection ? 'connected' : ''}"><i class="fa-brands fa-meta"></i> ${connection ? `@${rbEscape(connection.username || 'Instagram')} bağlı` : 'Meta bağlantısı yok'}</small></div><div class="rb-company-manager-actions"><button type="button" onclick="rbOpenCompanyModal('${rbEscape(company.docId)}')"><i class="fa-solid fa-pen"></i> Düzenle</button><button type="button" class="delete" onclick="rbDeleteCompany('${rbEscape(company.docId)}')"><i class="fa-regular fa-trash-can"></i> Sil</button></div></div>`; }).join('') : '<div class="rb-company-manager-empty"><i class="fa-regular fa-building"></i><b>Henüz rapor firması yok</b><span>Panel firmalarından bağımsız ilk rapor firmasını ekleyin.</span></div>';
    const modal = document.createElement('div');
    modal.id = 'rb-company-modal';
    modal.className = 'rb-company-modal';
    modal.innerHTML = `<div class="rb-company-dialog rb-company-manager" role="dialog" aria-modal="true" aria-labelledby="rb-company-manager-title"><button type="button" class="rb-company-close" onclick="rbCloseCompanyModal()" aria-label="Kapat">×</button><div class="rb-company-dialog-head"><span><i class="fa-solid fa-building-pen"></i></span><div><h3 id="rb-company-manager-title">Rapor Firmaları</h3><p>Bu liste panel firmalarından tamamen bağımsızdır.</p></div></div><div class="rb-company-manager-toolbar"><div><b>${dbReportCompanies.length}</b><span> kayıtlı rapor firması</span></div><button type="button" class="rb-button primary" onclick="rbOpenCompanyModal()"><i class="fa-solid fa-plus"></i> Yeni Firma Ekle</button></div><div class="rb-company-manager-list">${rows}</div></div>`;
    modal.addEventListener('click', event => { if (event.target === modal) rbCloseCompanyModal(); });
    document.body.appendChild(modal);
    document.addEventListener('keydown', rbCompanyModalEscape);
}

async function rbDeleteCompany(companyId) {
    const company = dbReportCompanies.find(item => item.docId === companyId);
    if (!company) return;
    const approved = confirm(`“${company.name || 'Bu firma'}” rapor firmasını silmek istediğinizden emin misiniz?\n\nFirma rapor seçiminden kaldırılacak. Panel firmaları etkilenmeyecek.`);
    if (!approved) return;
    try {
        const reportRef = db.collection('report_companies').doc(companyId);
        const legacyRef = db.collection('companies').doc(companyId);
        const legacySnapshot = await legacyRef.get();
        const batch = db.batch();
        batch.delete(reportRef);
        if (legacySnapshot.exists && String(legacySnapshot.data()?.createdFrom || '').startsWith('report-builder')) batch.delete(legacyRef);
        await batch.commit();
        try { if (rbIsOnlineMetaEnvironment()) await fetch(`/api/meta/disconnect?companyId=${encodeURIComponent(companyId)}`, { credentials: 'same-origin' }); } catch (_) {}
        const connections = rbMetaConnections();
        delete connections[companyId];
        localStorage.setItem('rdgrup-panel-meta-connections', JSON.stringify(connections));
        const period = rbState?.period || rbCurrentPeriod();
        const deletedCurrentCompany = rbState?.companyId === companyId;
        await fetchReportCompaniesFromFirebase();
        if (deletedCurrentCompany) rbState = rbLoadState(dbReportCompanies[0]?.docId || '', period);
        rbCloseCompanyModal();
        renderReportBuilderPage();
        rbOpenCompanyManager();
        alert('Rapor firması silindi. Paneldeki firmalar ve eski rapor taslakları etkilenmedi.');
    } catch (error) {
        console.error(error);
        alert('Rapor firması silinemedi. Firebase yetkilerini kontrol edin.');
    }
}

function rbOpenCompanyModal(companyId = '') {
    rbCloseCompanyModal();
    rbEditingCompanyId = companyId;
    const company = dbReportCompanies.find(item => item.docId === companyId) || {};
    rbPendingCompanyLogo = company.reportLogo || company.logo || '';
    rbPendingCompanyLogoTint = company.reportLogoTint !== false;
    const isEditing = Boolean(company.docId);
    const metaConnection = rbMetaConnectionFor(companyId);
    const companyColor = company.reportColor || company.color || '#6c63ff';
    const logoPreview = rbPendingCompanyLogo ? (rbPendingCompanyLogoTint ? rbTintedLogoMarkup(rbPendingCompanyLogo, 'Logo önizlemesi') : `<img src="${rbEscape(rbPendingCompanyLogo)}" alt="Logo önizlemesi">`) : '<i class="fa-solid fa-cloud-arrow-up"></i>';
    const metaSection = !isEditing
        ? '<div class="rb-company-meta wide"><span><i class="fa-brands fa-meta"></i></span><div><strong>Meta hesabını firma kaydından sonra seçin</strong><small>“Kaydet ve Meta Hesabı Seç” düğmesi doğru Instagram hesabını eşleştirme adımını açar.</small></div></div>'
        : `<div class="rb-company-meta wide ${metaConnection ? 'connected' : ''}"><span><i class="fa-brands fa-meta"></i></span><div><strong>${metaConnection ? `@${rbEscape(metaConnection.username || 'Instagram')} bu firmaya bağlı` : 'Meta hesabı henüz bağlanmadı'}</strong><small>${metaConnection ? 'Bu seçim tüm aylık raporlarda otomatik kullanılacak.' : 'Doğru Instagram hesabını şimdi seçin; rapor ekranında tekrar sorulmaz.'}</small>${metaConnection?.adsRead !== false && metaConnection ? '<label class="rb-company-ad-select">Reklam hesabı <span id="rb-company-ad-account-wrap"><i class="fa-solid fa-spinner fa-spin"></i> Hesaplar alınıyor…</span></label>' : ''}</div><div class="rb-company-meta-actions">${metaConnection ? `<button type="button" onclick="rbConnectMetaForCompany('${rbEscape(companyId)}')">Hesabı değiştir / izinleri yenile</button><button type="button" class="danger" onclick="rbDisconnectMetaForCompany('${rbEscape(companyId)}')">Bağlantıyı kes</button>` : `<button type="button" onclick="rbConnectMetaForCompany('${rbEscape(companyId)}')">Instagram hesabını seç</button>`}</div></div>`;
    const modal = document.createElement('div');
    modal.id = 'rb-company-modal';
    modal.className = 'rb-company-modal';
    modal.innerHTML = `<div class="rb-company-dialog" role="dialog" aria-modal="true" aria-labelledby="rb-company-title"><button type="button" class="rb-company-close" onclick="rbCloseCompanyModal()" aria-label="Kapat">×</button><div class="rb-company-dialog-head"><span><i class="fa-solid ${isEditing ? 'fa-building-pen' : 'fa-building-circle-check'}"></i></span><div><h3 id="rb-company-title">${isEditing ? 'Rapor Firmasını Düzenle' : 'Yeni Rapor Firması'}</h3><p>Firma bilgileri ve Meta eşleştirmesi tek yerde saklanır.</p></div></div><form class="rb-company-form" onsubmit="event.preventDefault(); rbSaveCompany(false)"><label>Firma adı <b>*</b><input id="rb-new-name" required autocomplete="organization" value="${rbEscape(company.name || '')}" placeholder="Örn. Gülçimen Aspava Emek"></label><label>Instagram hesabı<input id="rb-new-instagram" autocomplete="off" value="${rbEscape(company.instagram || '')}" placeholder="@kullaniciadi"></label><div class="rb-company-logo-field wide"><span>Firma logosu <small>PNG, JPG, WebP veya SVG</small></span><input id="rb-new-logo-file" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onchange="rbPrepareNewCompanyLogo(event)" hidden><button type="button" class="rb-company-logo-pick" onclick="document.getElementById('rb-new-logo-file').click()"><span id="rb-new-logo-preview" style="color:${rbEscape(companyColor)}">${logoPreview}</span><b id="rb-new-logo-text">${isEditing && rbPendingCompanyLogo ? 'Logoyu değiştir' : 'Bilgisayardan logo seç'}</b></button></div><label class="rb-company-tint wide"><input id="rb-new-logo-tint" type="checkbox" ${rbPendingCompanyLogoTint ? 'checked' : ''} onchange="rbToggleCompanyLogoTint(this.checked)"><span>Logoyu seçilen rapor rengine boya</span></label><label>Rapor rengi<input id="rb-new-color" type="color" value="${rbEscape(companyColor)}" oninput="rbUpdateCompanyLogoPreviewColor(this.value)"></label>${metaSection}<div class="rb-company-form-actions"><button type="button" class="rb-button" onclick="rbOpenCompanyManager()"><i class="fa-solid fa-arrow-left"></i> Firmalara Dön</button>${isEditing ? '<button type="submit" id="rb-company-save" class="rb-button primary"><i class="fa-solid fa-check"></i> Değişiklikleri Kaydet</button>' : '<button type="submit" id="rb-company-save" class="rb-button secondary"><i class="fa-solid fa-floppy-disk"></i> Sadece Kaydet</button><button type="button" id="rb-company-save-connect" class="rb-button primary" onclick="rbSaveCompany(true)"><i class="fa-brands fa-meta"></i> Kaydet ve Meta Hesabı Seç</button>'}</div></form></div>`;
    modal.addEventListener('click', event => { if (event.target === modal) rbCloseCompanyModal(); });
    document.body.appendChild(modal);
    document.addEventListener('keydown', rbCompanyModalEscape);
    if (isEditing && metaConnection?.adsRead !== false) setTimeout(() => rbLoadCompanyAdAccounts(companyId), 0);
    setTimeout(() => document.getElementById('rb-new-name')?.focus(), 30);
}

async function rbLoadCompanyAdAccounts(companyId) {
    const wrap = document.getElementById('rb-company-ad-account-wrap');
    if (!wrap || !companyId || !rbIsOnlineMetaEnvironment()) return;
    try {
        const response = await fetch(`/api/meta/ad-accounts?companyId=${encodeURIComponent(companyId)}`, { credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Reklam hesapları alınamadı.');
        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        const company = dbReportCompanies.find(item => item.docId === companyId) || {};
        let selected = company.reportAdAccountId || '';
        if (!selected && accounts.length === 1) {
            selected = accounts[0].accountId;
            await db.collection('report_companies').doc(companyId).set({ reportAdAccountId: selected }, { merge: true });
            company.reportAdAccountId = selected;
        }
        wrap.innerHTML = accounts.length ? `<select id="rb-company-ad-account" onchange="rbSaveCompanyAdAccount('${rbEscape(companyId)}',this.value)"><option value="">Reklam hesabı seçin</option>${accounts.map(account => `<option value="${rbEscape(account.accountId)}" ${account.accountId === selected ? 'selected' : ''}>${rbEscape(account.name)}${account.currency ? ` · ${rbEscape(account.currency)}` : ''}</option>`).join('')}</select>` : '<small>Bu kullanıcıya açık reklam hesabı bulunamadı.</small>';
    } catch (error) {
        wrap.innerHTML = `<small>${rbEscape(error.message || 'Reklam hesapları alınamadı.')}</small>`;
    }
}

async function rbSaveCompanyAdAccount(companyId, accountId) {
    try {
        await db.collection('report_companies').doc(companyId).set({ reportAdAccountId: accountId || '', updatedAt: new Date().toISOString() }, { merge: true });
        const company = dbReportCompanies.find(item => item.docId === companyId);
        if (company) company.reportAdAccountId = accountId || '';
        if (rbState?.companyId === companyId) rbState.adAccountId = accountId || '';
    } catch (_) { alert('Reklam hesabı seçimi kaydedilemedi.'); }
}

function rbCompanyModalEscape(event) {
    if (event.key === 'Escape') rbCloseCompanyModal();
}

function rbCloseCompanyModal() {
    document.getElementById('rb-company-modal')?.remove();
    document.removeEventListener('keydown', rbCompanyModalEscape);
}

async function rbPrepareNewCompanyLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const converted = await rbConvertLogoFile(file);
        rbPendingCompanyLogo = converted.dataUrl;
        rbPendingCompanyLogoTint = converted.tint;
        const preview = document.getElementById('rb-new-logo-preview');
        const text = document.getElementById('rb-new-logo-text');
        const tintInput = document.getElementById('rb-new-logo-tint');
        if (tintInput) tintInput.checked = rbPendingCompanyLogoTint;
        if (preview) preview.innerHTML = rbPendingCompanyLogoTint ? rbTintedLogoMarkup(rbPendingCompanyLogo, 'Logo önizlemesi') : `<img src="${rbEscape(rbPendingCompanyLogo)}" alt="Logo önizlemesi">`;
        if (text) text.textContent = file.name;
    } catch (error) {
        event.target.value = '';
        alert(error.message || 'Logo okunamadı.');
    }
}

async function rbUpdateCompanyLogo(event) {
    const file = event.target.files?.[0];
    const company = rbCompany();
    if (!file || !company.docId) return;
    try {
        const converted = await rbConvertLogoFile(file);
        await db.collection('report_companies').doc(company.docId).set({ reportLogo: converted.dataUrl, reportLogoTint: converted.tint, reportLogoUpdatedAt: new Date().toISOString() }, { merge: true });
        await fetchReportCompaniesFromFirebase();
        renderReportBuilderPage();
        alert('Firma logosu kaydedildi. Bundan sonraki PDF raporlarında otomatik kullanılacak.');
    } catch (error) {
        event.target.value = '';
        alert(error.message || 'Logo kaydedilemedi.');
    }
}

function rbUpdateCompanyLogoPreviewColor(color) {
    const preview = document.getElementById('rb-new-logo-preview');
    if (preview) preview.style.color = color;
}

function rbToggleCompanyLogoTint(enabled) {
    rbPendingCompanyLogoTint = enabled;
    const preview = document.getElementById('rb-new-logo-preview');
    if (!preview || !rbPendingCompanyLogo) return;
    preview.innerHTML = enabled ? rbTintedLogoMarkup(rbPendingCompanyLogo, 'Logo önizlemesi') : `<img src="${rbEscape(rbPendingCompanyLogo)}" alt="Logo önizlemesi">`;
}

function rbLogoLooksWhite(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data;
    let visible = 0;
    let white = 0;
    for (let index = 0; index < pixels.length; index += 16) {
        const alpha = pixels[index + 3];
        if (alpha < 35) continue;
        visible++;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (red > 185 && green > 185 && blue > 185 && Math.max(red, green, blue) - Math.min(red, green, blue) < 50) white++;
    }
    return visible > 0 && white / visible >= .72;
}

function rbConvertLogoFile(file) {
    return new Promise((resolve, reject) => {
        const extension = String(file.name || '').split('.').pop().toLowerCase();
        if (extension === 'eps' || file.type === 'application/postscript') return reject(new Error('EPS dosyası tarayıcıda doğrudan kullanılamaz. EPS’yi buraya gönderirsen PDF uyumlu PNG’ye dönüştürebilirim.'));
        if (!['png','jpg','jpeg','webp','svg'].includes(extension) && !String(file.type || '').startsWith('image/')) return reject(new Error('PNG, JPG, WebP veya SVG logo seçin.'));
        if (file.size > 15 * 1024 * 1024) return reject(new Error('Logo dosyası 15 MB’dan küçük olmalı.'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Logo dosyası okunamadı.'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('Logo görseli açılamadı.'));
            image.onload = () => {
                try {
                    const sourceWidth = image.naturalWidth || image.width;
                    const sourceHeight = image.naturalHeight || image.height;
                    if (!sourceWidth || !sourceHeight) return reject(new Error('Logo ölçüleri okunamadı.'));
                    const attempts = [[720,.9],[600,.84],[480,.76]];
                    let result = '';
                    let resultCanvas = null;
                    let resultContext = null;
                    for (const [maxSize, quality] of attempts) {
                        const ratio = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(sourceWidth * ratio));
                        canvas.height = Math.max(1, Math.round(sourceHeight * ratio));
                        const context = canvas.getContext('2d');
                        context.clearRect(0, 0, canvas.width, canvas.height);
                        context.drawImage(image, 0, 0, canvas.width, canvas.height);
                        result = canvas.toDataURL('image/webp', quality);
                        resultCanvas = canvas;
                        resultContext = context;
                        if (result.length <= 320000) break;
                    }
                    if (!result || result.length > 700000) return reject(new Error('Logo çok büyük. Daha sade veya küçük bir görsel seçin.'));
                    resolve({ dataUrl: result, tint: rbLogoLooksWhite(resultContext, resultCanvas.width, resultCanvas.height) });
                } catch (_) {
                    reject(new Error('Bu logo güvenli biçimde dönüştürülemedi. PNG veya JPG olarak tekrar deneyin.'));
                }
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function rbSetProfileImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const image = new Image();
        image.onload = () => {
            const maxWidth = 1100;
            const ratio = Math.min(1, maxWidth / image.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            rbState.profileImage = canvas.toDataURL('image/jpeg', .82);
            renderReportBuilderPage();
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
}

async function rbSaveDraft() {
    if (!rbState?.companyId) return alert('Önce firma seçin.');
    localStorage.setItem(rbStorageKey(rbState.companyId, rbState.period), JSON.stringify(rbState));
    const remoteState = { ...rbState, profileImage: '', updatedAt: new Date().toISOString(), updatedBy: currentUser?.id || '' };
    try {
        await db.collection('monthly_reports').doc(`${rbState.companyId}_${rbState.period}`).set(remoteState, { merge: true });
        if (rbCompany().docId) await db.collection('report_companies').doc(rbCompany().docId).set({ reportColor: rbState.accent }, { merge: true });
        alert('Rapor taslağı kaydedildi.');
    } catch (error) {
        console.error(error);
        alert('Taslak bu bilgisayara kaydedildi; Firebase kaydı için yetki gerekebilir.');
    }
}

function rbTotalInteraction() {
    return ['likes','comments','saves','shares'].reduce((sum, key) => sum + (Number(String(rbState[key] || '').replace(/\D/g, '')) || 0), 0);
}

function rbReportFooter(pageNumber) {
    return `<footer class="nr-footer"><span>${rbEscape(rbPeriodLabel())} Raporu</span><strong>RDGRUP <i>MEDYA</i></strong><b>${String(pageNumber).padStart(2, '0')}</b></footer>`;
}

function rbStandardPage(section, title, body, pageNumber) {
    const company = rbCompany();
    return `<section class="nr-page nr-standard"><div class="nr-rail"></div><header class="nr-header"><b>${String(pageNumber).padStart(2, '0')}</b><span>${rbEscape(section)}</span><small>${rbEscape(company.name || '')}</small></header><h2>${title}</h2>${body}${rbReportFooter(pageNumber)}</section>`;
}

function rbProfilePreview(company) {
    if (rbState.profileImage) return `<div class="nr-profile-shot"><img src="${rbEscape(rbState.profileImage)}" alt="Instagram profil görünümü"></div>`;
    const posts = Array.isArray(rbState.profilePosts) ? rbState.profilePosts.slice(0, 12) : [];
    if (posts.length) {
        const username = rbState.metaProfile?.username || rbMetaConnection()?.username || String(company.instagram || 'instagram').replace(/^@/, '');
        const metaAvatar = rbState.metaProfile?.profilePictureUrl || '';
        const avatarMarkup = metaAvatar ? rbImageMarkup([metaAvatar, rbState.metaProfile?.profilePictureFallbackUrl], `${username} profil fotoğrafı`) : (company.reportLogo || company.logo ? rbCompanyLogo(company) : `<span>${rbEscape(String(company.name || 'RD').slice(0, 2).toUpperCase())}</span>`);
        const grid = posts.map(post => rbImageSources(post.thumbnailUrl, post.thumbnailFallbackUrl).length
            ? `<a href="${rbEscape(post.permalink || '#')}" target="_blank" rel="noopener">${rbImageMarkup([post.thumbnailUrl, post.thumbnailFallbackUrl], 'Instagram gönderisi')}<i class="fa-brands ${post.type === 'Reels' ? 'fa-instagram' : 'fa-instagram'}"></i></a>`
            : '<div class="nr-instagram-empty"><i class="fa-regular fa-image"></i></div>').join('');
        return `<div class="nr-profile-shot nr-profile-shot-live"><div class="nr-instagram-profile"><div class="nr-instagram-bar"><i class="fa-brands fa-instagram"></i><b>Instagram</b></div><div class="nr-instagram-head"><div class="nr-instagram-avatar">${avatarMarkup}</div><div class="nr-instagram-identity"><strong>@${rbEscape(username)}</strong><span>${rbEscape(company.name || '')}</span></div><div class="nr-instagram-stats"><p><b>${rbFormatNumber(rbState.metaProfile?.mediaCount)}</b><span>gönderi</span></p><p><b>${rbFormatNumber(rbState.metaProfile?.followersCount ?? rbState.followers)}</b><span>takipçi</span></p><p><b>${posts.length}</b><span>son içerik</span></p></div></div><div class="nr-instagram-grid">${grid}</div></div></div>`;
    }
    return `<div class="nr-profile-shot"><div><i class="fa-brands fa-instagram"></i><b>${rbEscape(company.instagram || '@instagram')}</b><span>Profil ekran görüntüsü eklenmedi</span></div></div>`;
}

function rbCompactCaption(value, fallback = 'Instagram içeriği') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.length > 64 ? `${text.slice(0, 61).trim()}...` : text;
}

function rbInteractionDistribution() {
    const rows = [
        { label: 'Beğeni', value: Number(rbState.likes) || 0, color: 'var(--nr-safe-accent)' },
        { label: 'Yorum', value: Number(rbState.comments) || 0, color: 'color-mix(in srgb,var(--nr-accent) 72%,white)' },
        { label: 'Kaydetme', value: Number(rbState.saves) || 0, color: 'color-mix(in srgb,var(--nr-accent) 48%,white)' },
        { label: 'Paylaşım', value: Number(rbState.shares) || 0, color: 'color-mix(in srgb,var(--nr-accent) 72%,#17233f)' },
    ];
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    let cursor = 0;
    const stops = rows.map(row => {
        const start = cursor;
        cursor += total ? (row.value / total) * 100 : 25;
        return `${row.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    }).join(',');
    return { rows, total, gradient: `conic-gradient(${stops})` };
}

function rbPerformanceComment() {
    const top = Array.isArray(rbState.topContents) ? rbState.topContents[0] : null;
    if (top) {
        const metric = top.reach ? `${rbFormatNumber(top.reach)} erişim` : `${rbFormatNumber(top.interactions)} etkileşim`;
        return `${top.type || 'İçerik'} formatındaki “${rbCompactCaption(top.caption, 'öne çıkan paylaşım')}” bu ay ${metric} ile en yüksek performansı sağladı. Benzer tema ve anlatımın gelecek ay yeniden değerlendirilmesi önerilir.`;
    }
    if (Number(rbState.reach) > 0) return `Bu ay içerikler toplam ${rbFormatNumber(rbState.reach)} hesaba ulaştı. Düzenli yayın akışı ve etkileşim odaklı içerik çeşitliliği gelecek ay için korunabilir.`;
    return 'Dönem verileri tamamlandığında en güçlü içerik formatı ve gelecek ay için kısa öneri burada otomatik oluşturulur.';
}

function rbPerformanceSummaryPage(company, pageNumber) {
    const topContents = Array.isArray(rbState.topContents) ? rbState.topContents.slice(0, 3) : [];
    const contentTotal = rbState.contents.length + (Number(rbState.storyCount) || 0);
    const distribution = rbInteractionDistribution();
    const topRows = topContents.length ? topContents.map((item, index) => {
        const title = rbCompactCaption(item.caption, `${item.type || 'Instagram'} içeriği`);
        const image = rbImageMarkup([item.thumbnailUrl, item.thumbnailFallbackUrl], title);
        return `<a class="nr-best-row" href="${rbEscape(item.permalink || '#')}" target="_blank" rel="noopener"><b>${index + 1}</b><span class="nr-best-thumb">${image || '<i class="fa-regular fa-image"></i>'}</span><strong>${rbEscape(title)}</strong><span><small>Erişim</small><b>${rbFormatNumber(item.reach || item.views)}</b></span><span><small>Etkileşim</small><b>${rbFormatNumber(item.interactions)}</b></span></a>`;
    }).join('') : '<div class="nr-best-empty">Gönderi istatistikleri Meta’dan alındığında en iyi üç içerik burada listelenir.</div>';
    const legend = distribution.rows.map(row => `<p><i style="background:${row.color}"></i><span>${row.label}</span><b>${distribution.total ? Math.round((row.value / distribution.total) * 100) : 0}%</b></p>`).join('');
    return `<section class="nr-page nr-performance-summary"><div class="nr-summary-orb"></div><div class="nr-summary-dots"></div><header><span>${String(pageNumber).padStart(2, '0')}</span><b>RDGRUP MEDYA</b><small>${rbEscape(company.name || '')}</small></header><div class="nr-summary-title"><small>AYLIK SOSYAL MEDYA RAPORU</small><h2>Genel<br>Performans Özeti</h2><p>${rbEscape(rbPeriodLabel())} sosyal medya sonuçları</p></div><div class="nr-summary-kpis"><article><i class="fa-solid fa-chart-simple"></i><span>Toplam Erişim</span><b>${rbFormatNumber(rbState.reach)}</b></article><article><i class="fa-solid fa-heart"></i><span>Etkileşim</span><b>${rbFormatNumber(rbTotalInteraction())}</b></article><article><i class="fa-solid fa-user-plus"></i><span>Takipçi</span><b>${rbFormatNumber(rbState.followers)}</b></article><article><i class="fa-solid fa-paper-plane"></i><span>Paylaşılan İçerik</span><b>${rbFormatNumber(contentTotal)}</b></article></div><div class="nr-summary-middle"><article class="nr-summary-distribution"><h3>Etkileşim Dağılımı</h3><div><span class="nr-summary-donut" style="background:${distribution.gradient}"><b>${rbFormatNumber(distribution.total)}</b><small>Toplam</small></span><div>${legend}</div></div></article><article class="nr-summary-comment"><i class="fa-solid fa-comment-dots"></i><h3>Kısa Yorum</h3><p>${rbEscape(rbPerformanceComment())}</p></article></div><section class="nr-best-contents"><h3>En İyi İçerikler</h3><div>${topRows}</div></section>${rbReportFooter(pageNumber)}</section>`;
}

function rbOpenPreview() {
    if (!rbState?.companyId) return alert('Önce firma ekleyip seçin.');
    rbClosePreview();
    const company = rbCompany();
    const accent = rbState.accent || '#6c63ff';
    let page = 1;
    const sorted = [...rbState.contents].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const chunks = [];
    for (let index = 0; index < sorted.length; index += 12) chunks.push(sorted.slice(index, index + 12));
    if (!chunks.length) chunks.push([]);
    let pages = `<section class="nr-page nr-cover"><div class="nr-cover-rail"></div><div class="nr-cover-brand">RDGRUP <span>MEDYA</span></div><div class="nr-cover-logo">${rbCompanyLogo(company)}</div><div class="nr-cover-copy"><span>AYLIK SOSYAL MEDYA RAPORU</span><h1>${rbEscape(company.name || '')}</h1><p>Dijital performans, içerik ve reklam sonuçları</p></div><div class="nr-cover-period"><small>RAPOR DÖNEMİ</small><strong>${rbEscape(rbPeriodLabel().toUpperCase())}</strong></div></section>`;
    pages += rbPerformanceSummaryPage(company, page++);
    chunks.forEach((chunk, chunkIndex) => {
        const rows = chunk.length ? chunk.map(item => `<p><b>${rbEscape(rbFormatDate(item.date))}:</b><span>${rbEscape(item.type)} ve Story Paylaşımı</span></p>`).join('') : '<div class="nr-empty">Bu dönem için paylaşım eklenmedi.</div>';
        const totals = chunkIndex === chunks.length - 1 ? `<div class="nr-content-total"><span>AYLIK İÇERİK ÖZETİ</span><div><p><b>${rbState.contents.filter(item => item.type === 'Reels').length}</b><small>Reels</small></p><p><b>${rbState.contents.filter(item => item.type === 'Gönderi').length}</b><small>Gönderi</small></p><p><b>${rbFormatNumber(rbState.storyCount)}</b><small>Story</small></p></div></div>` : '';
        pages += rbStandardPage('İÇERİK PERFORMANSI', `PAYLAŞILAN<br><span>GÖNDERİLER</span>`, `<p class="nr-lead">Ay boyunca yayınlanan içeriklerin kronolojik özeti.</p><div class="nr-content-list">${rows}</div>${totals}`, page++);
    });
    pages += rbStandardPage('HESAP GÖRÜNÜMÜ', `HESABIN<br><span>GÖRÜNÜMÜ</span>`, `<p class="nr-lead">Instagram profilinin aylık rapora eklenen görünümü.</p>${rbProfilePreview(company)}`, page++);
    pages += rbStandardPage('ORGANİK PERFORMANS', `İSTATİSTİKLER <span>ERİŞİM</span>`, `<p class="nr-lead">İçeriklerin görünürlüğü ve hesap hareketleri.</p><div class="nr-metrics">${rbPreviewMetric('Toplam Görüntüleme',rbState.views)}${rbPreviewMetric('Erişilen Hesap',rbState.reach)}${rbPreviewMetric('Profil Ziyareti',rbState.profileVisits,true)}${rbPreviewMetric('Takipçi Sayısı',rbState.followers,true)}</div>`, page++);
    pages += rbStandardPage('TOPLULUK ETKİLEŞİMİ', `İSTATİSTİKLER <span>ETKİLEŞİM</span>`, `<p class="nr-lead">İçeriklere verilen toplam tepki ve dağılımı.</p><div class="nr-total-card"><span>Toplam Etkileşim</span><b>${rbFormatNumber(rbTotalInteraction())}</b></div><div class="nr-breakdown">${[['Beğeni',rbState.likes],['Yorum',rbState.comments],['Kaydetme',rbState.saves],['Paylaşım',rbState.shares]].map(row => `<p><span>${row[0]}</span><b>${rbFormatNumber(row[1])}</b></p>`).join('')}</div>`, page++);
    const metaAds = Array.isArray(rbState.metaAds) ? rbState.metaAds : [];
    for (let index = 0; index < metaAds.length; index += 4) {
        const adChunk = metaAds.slice(index, index + 4);
        const adCards = adChunk.map((ad, adIndex) => {
            const adName = String(ad.name || 'İsimsiz reklam');
            const contextLabel = [ad.campaignName, ad.adsetName].find(label => label && String(label).trim().toLocaleLowerCase('tr-TR') !== adName.trim().toLocaleLowerCase('tr-TR')) || 'Meta reklam kampanyası';
            return `<article class="nr-ad-card"><div class="nr-ad-image"><div class="nr-ad-image-fallback"><i class="fa-solid fa-photo-film"></i><span>Kapak görseli alınamadı</span></div>${rbImageMarkup(rbAdImageSources(ad), `${adName} kapak görseli`)}</div><div class="nr-ad-card-copy"><small>REKLAM ${String(index + adIndex + 1).padStart(2, '0')}</small><h3>${rbEscape(adName)}</h3><p>${rbEscape(contextLabel)}</p><div><span><b>${rbEscape(rbFormatAdSpend(ad.spend, ad.currency))}</b><small>Harcama · KDV dahil</small></span><span><b>${rbEscape(rbFormatNumber(ad.reach))}</b><small>Erişim</small></span><span><b>${rbEscape(rbFormatNumber(ad.impressions))}</b><small>Gösterim</small></span><span><b>${rbEscape(rbFormatNumber(ad.clicks))}</b><small>Tıklama</small></span></div></div></article>`;
        }).join('');
        pages += rbStandardPage('ÜCRETLİ MEDYA', `REKLAM <span>DETAYLARI</span>`, `<p class="nr-lead">Bu dönemde yayınlanan reklamların görseli ve ayrı sonuçları.</p><div class="nr-ad-grid">${adCards}</div>`, page++);
    }
    if ([rbState.adSpend,rbState.adImpressions,rbState.adReach,rbState.adClicks].some(Boolean)) pages += rbStandardPage('ÜCRETLİ MEDYA', `REKLAMLAR <span>TOPLAM</span>`, `<p class="nr-lead">Meta harcamasına %20 KDV eklenmiş, hesaptan çekilen aylık toplam sonuç.</p><div class="nr-metrics nr-ad-metrics">${rbPreviewMetric('Toplam Harcama · KDV Dahil',rbFormatAdSpend(rbState.adSpend, rbState.adCurrency))}${rbPreviewMetric('Gösterim',rbState.adImpressions)}${rbPreviewMetric('Erişim',rbState.adReach,true)}${rbPreviewMetric('Tıklama',rbState.adClicks,true)}</div>`, page++);
    if (rbState.notes.trim()) pages += rbStandardPage('AYLIK DEĞERLENDİRME', `SONUÇ VE <span>ÖNERİLER</span>`, `<p class="nr-lead">Ayın kısa değerlendirmesi ve sonraki dönem odağı.</p><div class="nr-notes">${rbEscape(rbState.notes).replace(/\n/g,'<br>')}</div>`, page++);

    const modal = document.createElement('div');
    modal.id = 'native-report-modal'; modal.className = 'native-report-modal'; modal.style.setProperty('--nr-accent', accent);
    modal.innerHTML = `<div class="nr-toolbar"><div><b>${rbEscape(company.name || '')}</b><span>${rbEscape(rbPeriodLabel())} Raporu</span></div><div><button type="button" onclick="window.print()"><i class="fa-regular fa-file-pdf"></i> PDF / Yazdır</button><button type="button" onclick="rbClosePreview()">Kapat</button></div></div><div class="nr-pages">${pages}</div>`;
    document.body.appendChild(modal);
}

function rbPreviewMetric(label, value, light = false) {
    const shown = typeof value === 'string' && /[₺$€£]|\b[A-Z]{3}\b/.test(value) ? value : rbFormatNumber(value);
    return `<div class="nr-metric ${light ? 'light' : ''}"><span>${rbEscape(label)}</span><b>${rbEscape(shown)}</b></div>`;
}

function rbClosePreview() {
    document.getElementById('native-report-modal')?.remove();
}
