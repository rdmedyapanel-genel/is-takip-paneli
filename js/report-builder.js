const rbMonthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
let rbState = null;

function rbEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function rbCurrentPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function rbEmptyState(companyId, period) {
    const company = dbCompanies.find(item => item.docId === companyId) || {};
    return {
        companyId,
        period,
        accent: company.reportColor || company.color || '#6c63ff',
        contents: [],
        storyCount: '',
        profileImage: '',
        views: '', reach: '', profileVisits: '', followers: '',
        likes: '', comments: '', saves: '', shares: '',
        adSpend: '', adImpressions: '', adReach: '', adClicks: '',
        notes: ''
    };
}

function rbStorageKey(companyId, period) {
    return `rdgrup-native-report-${companyId}-${period}`;
}

function rbLoadState(companyId, period) {
    const empty = rbEmptyState(companyId, period);
    try {
        const saved = JSON.parse(localStorage.getItem(rbStorageKey(companyId, period)) || 'null');
        return saved ? { ...empty, ...saved, companyId, period, contents: Array.isArray(saved.contents) ? saved.contents : [] } : empty;
    } catch (_) { return empty; }
}

function rbCompany() {
    return dbCompanies.find(item => item.docId === rbState?.companyId) || dbCompanies[0] || {};
}

function rbPeriodLabel(period = rbState?.period) {
    const [year, month] = String(period || rbCurrentPeriod()).split('-');
    return `${rbMonthNames[Math.max(0, Number(month) - 1)]} ${year}`;
}

function rbFormatNumber(value) {
    const parsed = Number(String(value || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? new Intl.NumberFormat('tr-TR').format(parsed) : '—';
}

function rbFormatDate(value) {
    if (!value) return 'Tarih girilmedi';
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

function rbEnsureState() {
    const firstCompany = dbCompanies[0];
    if (!firstCompany) { rbState = rbEmptyState('', rbCurrentPeriod()); return; }
    const companyExists = rbState && dbCompanies.some(item => item.docId === rbState.companyId);
    if (!companyExists) rbState = rbLoadState(firstCompany.docId, rbCurrentPeriod());
}

function renderReportBuilderPage() {
    rbEnsureState();
    const company = rbCompany();
    const companyOptions = dbCompanies.map(item => `<option value="${rbEscape(item.docId)}" ${item.docId === rbState.companyId ? 'selected' : ''}>${rbEscape(item.name || 'İsimsiz Firma')}</option>`).join('');
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
                <div class="rb-top-actions"><button type="button" class="rb-button secondary" onclick="rbSaveDraft()"><i class="fa-regular fa-floppy-disk"></i> Taslağı kaydet</button><button type="button" class="rb-button primary" onclick="rbOpenPreview()"><i class="fa-regular fa-file-pdf"></i> Önizle / PDF</button></div>
            </header>

            ${dbCompanies.length ? '' : '<div class="rb-warning">Rapor oluşturmak için önce aşağıdan firma ekleyin.</div>'}
            <div class="rb-layout">
                <section class="rb-form-column">
                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>01</b><div><h3>Rapor bilgileri</h3><p>Firma, dönem ve rapor rengini belirle.</p></div></div>
                        <div class="rb-fields three">
                            <label>Firma<select id="rb-company" onchange="rbSwitchContext()">${companyOptions || '<option value="">Firma yok</option>'}</select></label>
                            <label>Rapor dönemi<input id="rb-period" type="month" value="${rbEscape(rbState.period)}" onchange="rbSwitchContext()"></label>
                            <label>Rapor rengi<div class="rb-color"><input type="color" value="${rbEscape(rbState.accent)}" oninput="rbSetField('accent',this.value)"><span>${rbEscape(rbState.accent.toUpperCase())}</span></div></label>
                        </div>
                        <details class="rb-company-add"><summary><i class="fa-solid fa-plus"></i> Yeni firma ekle</summary><div class="rb-company-add-grid"><label>Firma adı<input id="rb-new-name" placeholder="Örn. Gülçimen Aspava Emek"></label><label>Instagram hesabı<input id="rb-new-instagram" placeholder="@kullaniciadi"></label><label>Logo bağlantısı<input id="rb-new-logo" placeholder="https://..."></label><label>Rapor rengi<input id="rb-new-color" type="color" value="#6c63ff"></label><button type="button" class="rb-button primary" onclick="rbAddCompany()">Firmayı ekle</button></div></details>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>02</b><div><h3>Instagram paylaşımları</h3><p>Takvimde tamamlanan paylaşımları getir veya elle ekle.</p></div><div class="rb-panel-actions"><button type="button" onclick="rbImportPanelContents()">Panelden getir</button><button type="button" onclick="rbAddContent()">+ Ekle</button></div></div>
                        <div class="rb-story-field"><label>Bu ay toplam Story<input type="number" min="0" value="${rbEscape(rbState.storyCount)}" oninput="rbSetField('storyCount',this.value)"></label><span>Gönderi listesinde her içerik “ve Story Paylaşımı” şeklinde gösterilir.</span></div>
                        <div class="rb-content-list">${contentRows}</div>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>03</b><div><h3>Hesabın görünümü</h3><p>Instagram profil ekran görüntüsünü rapora ekle.</p></div></div>
                        <label class="rb-upload"><input type="file" accept="image/*" onchange="rbSetProfileImage(event)" hidden>${rbState.profileImage ? `<img src="${rbEscape(rbState.profileImage)}" alt="Profil önizlemesi"><span>Görseli değiştir</span>` : '<i class="fa-regular fa-image"></i><strong>Profil ekran görüntüsü seç</strong><span>PNG veya JPG</span>'}</label>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>04</b><div><h3>Erişim istatistikleri</h3><p>Aylık organik hesap sonuçlarını gir.</p></div></div>
                        <div class="rb-fields metrics">${rbMetricInput('views','Toplam görüntüleme')}${rbMetricInput('reach','Erişilen hesap')}${rbMetricInput('profileVisits','Profil ziyareti')}${rbMetricInput('followers','Takipçi sayısı')}</div>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>05</b><div><h3>Etkileşim istatistikleri</h3><p>İçeriklerin aldığı aksiyonları tamamla.</p></div></div>
                        <div class="rb-fields metrics">${rbMetricInput('likes','Beğeni')}${rbMetricInput('comments','Yorum')}${rbMetricInput('saves','Kaydetme')}${rbMetricInput('shares','Paylaşım')}</div>
                    </article>

                    <article class="rb-panel">
                        <div class="rb-panel-head"><b>06</b><div><h3>Meta reklamları</h3><p>Reklam sonuçlarını ekle; boş bırakırsan PDF sayfası oluşmaz.</p></div></div>
                        <div class="rb-fields metrics">${rbMetricInput('adSpend','Toplam harcama (₺)')}${rbMetricInput('adImpressions','Gösterim')}${rbMetricInput('adReach','Reklam erişimi')}${rbMetricInput('adClicks','Tıklama')}</div>
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
    const logo = company.reportLogo || company.logo || '';
    if (logo) return `<img src="${rbEscape(logo)}" alt="${rbEscape(company.name || 'Firma')} logosu">`;
    const initials = String(company.name || 'RD').split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();
    return `<span>${rbEscape(initials || 'RD')}</span>`;
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

async function rbAddCompany() {
    const name = document.getElementById('rb-new-name')?.value.trim();
    if (!name) return alert('Firma adını girin.');
    const data = {
        name,
        instagram: document.getElementById('rb-new-instagram')?.value.trim() || '',
        reportLogo: document.getElementById('rb-new-logo')?.value.trim() || '',
        reportColor: document.getElementById('rb-new-color')?.value || '#6c63ff',
        order: dbCompanies.length,
        showInAds: false,
        createdFrom: 'report-builder'
    };
    try {
        const result = await db.collection('companies').add(data);
        await fetchCompaniesFromFirebase();
        rbState = rbLoadState(result.id, rbCurrentPeriod());
        renderReportBuilderPage();
        alert('Firma eklendi ve rapora seçildi.');
    } catch (error) {
        console.error(error);
        alert('Firma eklenemedi. Firebase yetkilerini kontrol edin.');
    }
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
        if (rbCompany().docId) await db.collection('companies').doc(rbCompany().docId).set({ reportColor: rbState.accent }, { merge: true });
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

function rbOpenPreview() {
    if (!rbState?.companyId) return alert('Önce firma ekleyip seçin.');
    rbClosePreview();
    const company = rbCompany();
    const accent = rbState.accent || '#6c63ff';
    let page = 1;
    const sorted = [...rbState.contents].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const chunks = [];
    for (let index = 0; index < sorted.length; index += 14) chunks.push(sorted.slice(index, index + 14));
    if (!chunks.length) chunks.push([]);
    let pages = `<section class="nr-page nr-cover"><div class="nr-cover-rail"></div><div class="nr-cover-brand">RDGRUP <span>MEDYA</span></div><div class="nr-cover-logo">${rbCompanyLogo(company)}</div><div class="nr-cover-copy"><span>AYLIK HİZMET RAPORU</span><h1>${rbEscape(company.name || '')}</h1><p>Dijital performans, içerik ve reklam özeti</p></div><div class="nr-cover-period"><small>RAPOR DÖNEMİ</small><strong>${rbEscape(rbPeriodLabel().toUpperCase())}</strong></div></section>`;
    chunks.forEach((chunk, chunkIndex) => {
        const rows = chunk.length ? chunk.map(item => `<p><b>${rbEscape(rbFormatDate(item.date))}:</b><span>${rbEscape(item.type)} ve Story Paylaşımı</span></p>`).join('') : '<div class="nr-empty">Bu dönem için paylaşım eklenmedi.</div>';
        const totals = chunkIndex === chunks.length - 1 ? `<div class="nr-content-total"><span>AYLIK İÇERİK ÖZETİ</span><div><p><b>${rbState.contents.filter(item => item.type === 'Reels').length}</b><small>Reels</small></p><p><b>${rbState.contents.filter(item => item.type === 'Gönderi').length}</b><small>Gönderi</small></p><p><b>${rbFormatNumber(rbState.storyCount)}</b><small>Story</small></p></div></div>` : '';
        pages += rbStandardPage('İÇERİK PERFORMANSI', `PAYLAŞILAN<br><span>GÖNDERİLER</span>`, `<p class="nr-lead">Ay boyunca yayınlanan içeriklerin kronolojik özeti.</p><div class="nr-content-list">${rows}</div>${totals}`, page++);
    });
    pages += rbStandardPage('HESAP GÖRÜNÜMÜ', `HESABIN<br><span>GÖRÜNÜMÜ</span>`, `<p class="nr-lead">Instagram profilinin aylık rapora eklenen görünümü.</p><div class="nr-profile-shot">${rbState.profileImage ? `<img src="${rbEscape(rbState.profileImage)}" alt="Instagram profil görünümü">` : `<div><i class="fa-brands fa-instagram"></i><b>${rbEscape(company.instagram || '@instagram')}</b><span>Profil ekran görüntüsü eklenmedi</span></div>`}</div>`, page++);
    pages += rbStandardPage('ORGANİK PERFORMANS', `İSTATİSTİKLER <span>ERİŞİM</span>`, `<p class="nr-lead">İçeriklerin görünürlüğü ve hesap hareketleri.</p><div class="nr-metrics">${rbPreviewMetric('Toplam Görüntüleme',rbState.views)}${rbPreviewMetric('Erişilen Hesap',rbState.reach)}${rbPreviewMetric('Profil Ziyareti',rbState.profileVisits,true)}${rbPreviewMetric('Takipçi Sayısı',rbState.followers,true)}</div>`, page++);
    pages += rbStandardPage('TOPLULUK ETKİLEŞİMİ', `İSTATİSTİKLER <span>ETKİLEŞİM</span>`, `<p class="nr-lead">İçeriklere verilen toplam tepki ve dağılımı.</p><div class="nr-total-card"><span>Toplam Etkileşim</span><b>${rbFormatNumber(rbTotalInteraction())}</b></div><div class="nr-breakdown">${[['Beğeni',rbState.likes],['Yorum',rbState.comments],['Kaydetme',rbState.saves],['Paylaşım',rbState.shares]].map(row => `<p><span>${row[0]}</span><b>${rbFormatNumber(row[1])}</b></p>`).join('')}</div>`, page++);
    if ([rbState.adSpend,rbState.adImpressions,rbState.adReach,rbState.adClicks].some(Boolean)) pages += rbStandardPage('ÜCRETLİ MEDYA', `REKLAMLAR <span>META</span>`, `<p class="nr-lead">Aylık reklam harcaması ve sonuç özeti.</p><div class="nr-metrics nr-ad-metrics">${rbPreviewMetric('Toplam Harcama',`${rbFormatNumber(rbState.adSpend)} ₺`)}${rbPreviewMetric('Gösterim',rbState.adImpressions)}${rbPreviewMetric('Erişim',rbState.adReach,true)}${rbPreviewMetric('Tıklama',rbState.adClicks,true)}</div>`, page++);
    if (rbState.notes.trim()) pages += rbStandardPage('AYLIK DEĞERLENDİRME', `SONUÇ VE <span>ÖNERİLER</span>`, `<p class="nr-lead">Ayın kısa değerlendirmesi ve sonraki dönem odağı.</p><div class="nr-notes">${rbEscape(rbState.notes).replace(/\n/g,'<br>')}</div>`, page++);

    const modal = document.createElement('div');
    modal.id = 'native-report-modal'; modal.className = 'native-report-modal'; modal.style.setProperty('--nr-accent', accent);
    modal.innerHTML = `<div class="nr-toolbar"><div><b>${rbEscape(company.name || '')}</b><span>${rbEscape(rbPeriodLabel())} Raporu</span></div><div><button type="button" onclick="window.print()"><i class="fa-regular fa-file-pdf"></i> PDF / Yazdır</button><button type="button" onclick="rbClosePreview()">Kapat</button></div></div><div class="nr-pages">${pages}</div>`;
    document.body.appendChild(modal);
}

function rbPreviewMetric(label, value, light = false) {
    const shown = typeof value === 'string' && value.includes('₺') ? value : rbFormatNumber(value);
    return `<div class="nr-metric ${light ? 'light' : ''}"><span>${rbEscape(label)}</span><b>${rbEscape(shown)}</b></div>`;
}

function rbClosePreview() {
    document.getElementById('native-report-modal')?.remove();
}
