'use strict';

const Payments = {
    monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; },
    validMonth(value) { return /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value); },
    shiftMonth(month, delta) {
        if (!this.validMonth(month)) return month;
        const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + delta, 1);
        const next = this.monthKey(date);
        return this.validMonth(next) ? next : month;
    },
    docId(companyId, month) { return [companyId, month].map(encodeURIComponent).join('__'); },
    parseAmount(value) {
        if (String(value).trim() === '') return null;
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000000 || Math.round(amount * 100) / 100 !== amount) throw new Error('Geçerli bir tutar girin (en fazla iki ondalık basamak).');
        return amount;
    },
    total(amount, vat) { return amount === null ? null : Math.round(amount * (vat ? 120 : 100)) / 100; },
    completed(record) { return ['hasInvoice', 'reportSent', 'paymentOrInvoiceSent', 'paymentReceived'].every(key => record?.[key] === true); },
    currency(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value); },
    escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
};

let paymentsMonth = Payments.monthKey();
let paymentsRequest = 0;
let paymentsHiddenCompanies = [];
const paymentsSaveQueues = new Map();

function paymentsControls() {
    return `<div class="payments-toolbar"><div class="payments-title-group"><span class="payments-title-icon" aria-hidden="true"><i class="fa-solid fa-money-bill-transfer"></i></span><div><h2 class="content-title">Ödemeler</h2><p>Aylık ödeme ve evrak takibi</p></div></div><div class="payments-toolbar-actions" data-html2canvas-ignore><div class="payments-month-controls"><button type="button" class="action-btn" onclick="changePaymentsMonth(-1)" aria-label="Önceki ay"><i class="fa-solid fa-chevron-left"></i></button><label class="payments-sr-only" for="payments-month">Dönem</label><input id="payments-month" type="month" min="1000-01" max="9999-12" value="${paymentsMonth}" onchange="setPaymentsMonth(this.value)"><button type="button" class="action-btn" onclick="changePaymentsMonth(1)" aria-label="Sonraki ay"><i class="fa-solid fa-chevron-right"></i></button><button type="button" class="login-btn btn-light" onclick="setPaymentsMonth(Payments.monthKey())">Bu Ay</button></div><button type="button" id="payments-export" class="login-btn payments-export-btn" onclick="downloadPaymentsJpg()" disabled><i class="fa-solid fa-download"></i> JPG olarak indir</button></div></div>`;
}

function setPaymentsMonth(month) {
    if (!isStatisticsAdmin() || !Payments.validMonth(month)) return;
    paymentsMonth = month;
    loadPaymentsPage();
}
function changePaymentsMonth(delta) { setPaymentsMonth(Payments.shiftMonth(paymentsMonth, delta)); }

function paymentsRow(company, record) {
    const id = Payments.escape(company.docId);
    const name = Payments.escape(company.name || 'İsimsiz Firma');
    const amount = record?.amount ?? '';
    const debt = record?.pastDebt ?? '';
    const vat = record?.vat === true;
    const check = (key, label) => `<td class="payments-check"><label><input type="checkbox" data-field="${key}" aria-label="${name}: ${label}" ${record?.[key] === true ? 'checked' : ''}></label></td>`;
    const completed = Payments.completed(record);
    return `<tr data-company-id="${id}" class="${completed ? 'is-complete' : ''}"><th scope="row">${name}<span class="payments-complete-label" ${completed ? '' : 'hidden'}>Tamamlandı</span><small class="payments-row-status" role="status"></small></th><td><div class="payments-amount"><input data-field="amount" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" value="${Payments.escape(amount)}" aria-label="${name}: Ödeme Tutarı" placeholder="0,00"><div class="payments-vat-options" role="group" aria-label="${name}: KDV seçimi"><button type="button" data-action="vat-included" class="payments-vat ${vat ? '' : 'is-active'}" aria-pressed="${!vat}" aria-label="${name}: KDV Dahil">KDV Dahil</button><button type="button" data-action="vat" class="payments-vat ${vat ? 'is-active' : ''}" aria-pressed="${vat}" aria-label="${name}: + %20 KDV">+ %20 KDV</button></div></div><small class="payments-total">${amount === '' ? 'Toplam: —' : `Toplam: ${Payments.currency(Payments.total(amount, vat))}`}</small></td>${check('hasInvoice', 'Fatura var mı')}${check('reportSent', 'Rapor İletildi')}${check('paymentOrInvoiceSent', 'Ödeme/Fatura İletildi')}${check('paymentReceived', 'Ödeme geldi')}<td><input data-field="pastDebt" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" value="${Payments.escape(debt)}" aria-label="${name}: Geçmiş kalan borç" placeholder="0,00"></td></tr>`;
}

function paymentsCompanyEditor() {
    const hidden = new Set(paymentsHiddenCompanies);
    const options = dbCompanies.filter(c => c.docId).map(c => `<label class="payments-company-option"><input type="checkbox" value="${Payments.escape(c.docId)}" ${hidden.has(c.docId) ? '' : 'checked'}><span>${Payments.escape(c.name || 'İsimsiz Firma')}</span></label>`).join('');
    return `<div class="payments-company-editor" id="payments-company-editor" data-html2canvas-ignore hidden><div class="payments-editor-header"><div><h4>Görünecek Firmalar</h4><p>Seçili firmalar tüm aylarda görünür. Gizlenen firmaların önceki ödeme kayıtları saklanır.</p></div><button type="button" class="action-btn" onclick="togglePaymentsCompanyEditor()" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button></div><div class="payments-company-list">${options || '<p>Firmalar sayfasında kayıtlı firma bulunamadı.</p>'}</div><div class="payments-editor-footer"><button type="button" class="login-btn btn-purple" id="payments-company-save" onclick="savePaymentsCompanies()">Seçimi Kaydet</button><span id="payments-company-status" role="status"></span></div></div>`;
}

function togglePaymentsCompanyEditor() {
    const editor = document.getElementById('payments-company-editor');
    if (!editor) return;
    editor.hidden = !editor.hidden;
    const button = document.getElementById('payments-company-toggle');
    if (button) button.setAttribute('aria-expanded', String(!editor.hidden));
}

async function savePaymentsCompanies() {
    if (!isStatisticsAdmin() || activePage !== 'Ödemeler') return;
    const editor = document.getElementById('payments-company-editor');
    if (!editor) return;
    const checked = new Set([...editor.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value));
    const hidden = dbCompanies.filter(c => c.docId && !checked.has(c.docId)).map(c => c.docId);
    const button = document.getElementById('payments-company-save');
    const status = document.getElementById('payments-company-status');
    const month = paymentsMonth;
    button.disabled = true; status.textContent = 'Kaydediliyor...';
    try {
        const admin = dbUsers.find(u => u.id === currentUser.id && (!currentUser.docId || u.docId === currentUser.docId));
        if (!admin?.docId) throw new Error('Admin kaydı bulunamadı');
        const userSnapshot = await db.collection('users').doc(admin.docId).get();
        if (!userSnapshot.exists || !statisticsUserIsAdmin(userSnapshot.data())) throw new Error('Admin yetkisi bulunamadı');
        await db.collection('payment_settings').doc('visible_companies').set({ hiddenCompanyIds: hidden, updatedAt: new Date().toISOString(), updatedBy: currentUser.id });
        paymentsHiddenCompanies = hidden;
        if (activePage === 'Ödemeler' && paymentsMonth === month) await loadPaymentsPage();
    } catch (error) {
        console.error('Firma görünürlüğü kayıt hatası:', error);
        status.textContent = 'Kaydedilemedi. Bağlantınızı veya yetkinizi kontrol edin.';
        button.disabled = false;
    }
}

async function loadPaymentsPage() {
    if (!isStatisticsAdmin()) return;
    const request = ++paymentsRequest;
    const month = paymentsMonth;
    const container = document.getElementById('main-content');
    container.innerHTML = `<section class="content-card payments-page">${paymentsControls()}<div class="payments-message" role="status">Ödemeler yükleniyor...</div></section>`;
    try {
        const [snapshot, settings] = await Promise.all([
            db.collection('payment_tracking').where('month', '==', month).get(),
            db.collection('payment_settings').doc('visible_companies').get()
        ]);
        if (request !== paymentsRequest || activePage !== 'Ödemeler' || !isStatisticsAdmin()) return;
        paymentsHiddenCompanies = settings.exists && Array.isArray(settings.data().hiddenCompanyIds) ? settings.data().hiddenCompanyIds : [];
        const hidden = new Set(paymentsHiddenCompanies);
        const records = new Map();
        snapshot.forEach(doc => { const entry = doc.data(); if (entry.companyId) records.set(String(entry.companyId), entry); });
        const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        const rows = dbCompanies.filter(c => c.docId && !hidden.has(c.docId)).map(c => paymentsRow(c, records.get(c.docId))).join('');
        container.innerHTML = `<section class="content-card payments-page">${paymentsControls()}<div class="payments-heading"><h3>${Payments.escape(label)}</h3><div class="payments-heading-actions" data-html2canvas-ignore><button type="button" class="login-btn btn-light" id="payments-company-toggle" aria-controls="payments-company-editor" aria-expanded="false" onclick="togglePaymentsCompanyEditor()"><i class="fa-solid fa-pen-to-square"></i> Firmaları Düzenle</button><button type="button" class="login-btn btn-light" onclick="loadPaymentsPage()"><i class="fa-solid fa-rotate"></i> Yenile</button></div></div>${paymentsCompanyEditor()}<div class="payments-summary" id="payments-summary"></div><div class="payments-table-scroll"><table class="payments-table"><thead><tr><th scope="col">Firma İsmi</th><th scope="col" class="payments-col-amount">Ödeme Tutarı</th><th scope="col">Fatura var mı</th><th scope="col">Rapor İletildi</th><th scope="col">Ödeme/Fatura İletildi</th><th scope="col" class="payments-col-received">Ödeme geldi</th><th scope="col" class="payments-col-debt">Geçmiş kalan borç</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="payments-message">Görünür firma yok. “Firmaları Düzenle” ile seçim yapabilirsiniz.</td></tr>'}</tbody></table></div><p class="payments-hint"><span><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Değişiklikler otomatik kaydedilir.</span><span>KDV Dahil: tutar değişmez · + %20 KDV: toplama eklenir · Geçmiş borç ayrıdır.</span></p><p id="payments-export-status" class="payments-export-status" role="status" data-html2canvas-ignore></p></section>`;
        const exportButton = document.getElementById('payments-export');
        if (exportButton) exportButton.disabled = false;
        const table = container.querySelector('.payments-table');
        table.addEventListener('click', event => {
            const button = event.target.closest('[data-action="vat"], [data-action="vat-included"]');
            if (!button) return;
            if (button.getAttribute('aria-pressed') === 'true') return;
            const row = button.closest('tr');
            const enabled = button.dataset.action === 'vat';
            for (const option of row.querySelectorAll('.payments-vat')) {
                const selected = (option.dataset.action === 'vat') === enabled;
                option.setAttribute('aria-pressed', String(selected));
                option.classList.toggle('is-active', selected);
            }
            updatePaymentsSummary();
            savePaymentRow(row);
        });
        table.addEventListener('input', event => { if (event.target.matches('input[data-field]')) updatePaymentsSummary(); });
        table.addEventListener('change', event => { if (event.target.matches('input[data-field]')) { const row = event.target.closest('tr'); updatePaymentsRowState(row); updatePaymentsSummary(); savePaymentRow(row); } });
        updatePaymentsSummary();
    } catch (error) {
        if (request !== paymentsRequest || activePage !== 'Ödemeler') return;
        console.error('Ödemeler yükleme hatası:', error);
        container.innerHTML = `<section class="content-card payments-page">${paymentsControls()}<p class="payments-message" role="alert">Ödemeler alınamadı. Bağlantınızı ve veritabanı izinlerini kontrol edin.</p><button type="button" class="login-btn btn-light" onclick="loadPaymentsPage()">Tekrar Dene</button></section>`;
    }
}

function updatePaymentsRowState(row) {
    if (!row) return;
    const complete = ['hasInvoice', 'reportSent', 'paymentOrInvoiceSent', 'paymentReceived'].every(key => row.querySelector(`[data-field="${key}"]`).checked);
    row.classList.toggle('is-complete', complete);
    row.querySelector('.payments-complete-label').hidden = !complete;
}

function paymentValues(row) {
    const input = key => row.querySelector(`[data-field="${key}"]`);
    const amount = Payments.parseAmount(input('amount').value);
    const pastDebt = Payments.parseAmount(input('pastDebt').value);
    return { amount, pastDebt, vat: row.querySelector('[data-action="vat"]').getAttribute('aria-pressed') === 'true',
        hasInvoice: input('hasInvoice').checked, reportSent: input('reportSent').checked,
        paymentOrInvoiceSent: input('paymentOrInvoiceSent').checked, paymentReceived: input('paymentReceived').checked };
}

function updatePaymentsSummary() {
    const summary = document.getElementById('payments-summary');
    if (!summary) return;
    const rows = [...document.querySelectorAll('.payments-table tbody tr[data-company-id]')];
    let total = 0, received = 0, debt = 0;
    for (const row of rows) {
        const amountInput = row.querySelector('[data-field="amount"]');
        const debtInput = row.querySelector('[data-field="pastDebt"]');
        const vat = row.querySelector('[data-action="vat"]').getAttribute('aria-pressed') === 'true';
        let amount = null;
        try { amount = Payments.parseAmount(amountInput.value); } catch (_) { /* Keep the last valid summary until the input is fixed. */ }
        const rowTotal = Payments.total(amount, vat);
        row.querySelector('.payments-total').textContent = `Toplam: ${rowTotal === null ? '—' : Payments.currency(rowTotal)}`;
        total += rowTotal || 0;
        try { debt += Payments.parseAmount(debtInput.value) || 0; } catch (_) { /* Invalid values are rejected on save. */ }
        if (row.querySelector('[data-field="paymentReceived"]').checked) received++;
    }
    summary.innerHTML = `<div class="payments-stat"><span class="payments-stat-icon" aria-hidden="true"><i class="fa-solid fa-building"></i></span><div><span>Takip edilen firma</span><strong>${rows.length} <small>firma</small></strong></div></div><div class="payments-stat is-blue"><span class="payments-stat-icon" aria-hidden="true"><i class="fa-solid fa-wallet"></i></span><div><span>Aylık toplam</span><strong>${Payments.currency(total)}</strong></div></div><div class="payments-stat is-green"><span class="payments-stat-icon" aria-hidden="true"><i class="fa-solid fa-circle-check"></i></span><div><span>Ödemesi gelen</span><strong>${received} <small>/ ${rows.length} firma</small></strong></div></div><div class="payments-stat is-orange"><span class="payments-stat-icon" aria-hidden="true"><i class="fa-solid fa-clock-rotate-left"></i></span><div><span>Geçmiş kalan borç</span><strong>${Payments.currency(debt)}</strong></div></div>`;
}

function savePaymentRow(row) {
    if (!row || !isStatisticsAdmin() || activePage !== 'Ödemeler') return;
    const status = row.querySelector('.payments-row-status');
    let values;
    try { values = paymentValues(row); }
    catch (error) { status.textContent = error.message; status.className = 'payments-row-status is-error'; return; }
    const month = paymentsMonth, companyId = row.dataset.companyId;
    const docId = Payments.docId(companyId, month);
    const data = { companyId, month, ...values, updatedAt: new Date().toISOString(), updatedBy: currentUser.id };
    const request = (Number(row.dataset.saveRequest) || 0) + 1;
    row.dataset.saveRequest = String(request);
    status.textContent = 'Kaydediliyor...'; status.className = 'payments-row-status';
    const previous = paymentsSaveQueues.get(docId) || Promise.resolve();
    const save = previous.catch(() => {}).then(async () => {
        const admin = dbUsers.find(u => u.id === currentUser.id && (!currentUser.docId || u.docId === currentUser.docId));
        if (!admin?.docId) throw new Error('Admin kaydı bulunamadı');
        const userSnapshot = await db.collection('users').doc(admin.docId).get();
        if (!userSnapshot.exists || !statisticsUserIsAdmin(userSnapshot.data())) throw new Error('Admin yetkisi bulunamadı');
        await db.collection('payment_tracking').doc(docId).set(data);
    });
    paymentsSaveQueues.set(docId, save);
    save.then(() => {
        if (row.isConnected && row.dataset.saveRequest === String(request)) { status.textContent = 'Kaydedildi'; status.className = 'payments-row-status is-saved'; }
    }).catch(error => {
        console.error('Ödeme kayıt hatası:', error);
        if (row.isConnected && row.dataset.saveRequest === String(request)) { status.textContent = 'Kaydedilemedi. Tekrar değiştirin.'; status.className = 'payments-row-status is-error'; }
    }).finally(() => { if (paymentsSaveQueues.get(docId) === save) paymentsSaveQueues.delete(docId); });
}

// Export a detached snapshot so the visible form and saved values never change.
async function downloadPaymentsJpg() {
    if (!isStatisticsAdmin() || activePage !== 'Ödemeler') return;
    const page = document.querySelector('.payments-page');
    const button = document.getElementById('payments-export');
    const status = document.getElementById('payments-export-status');
    if (!page?.querySelector('.payments-table') || !button || button.disabled) return;
    button.disabled = true;
    const originalLabel = button.innerHTML;
    button.textContent = 'JPG hazırlanıyor…';
    if (status) status.textContent = '';
    let snapshot;
    let imageUrl;
    try {
        if (typeof html2canvas !== 'function') throw new Error('Görüntü oluşturucu yüklenemedi.');
        const month = paymentsMonth;
        snapshot = page.cloneNode(true);
        snapshot.classList.add('payments-export-snapshot');
        snapshot.querySelectorAll('[data-html2canvas-ignore], .payments-row-status').forEach(element => element.remove());
        // Render values and checkmarks as text for consistent JPG output on every browser.
        snapshot.querySelectorAll('input').forEach(input => {
            const value = document.createElement('span');
            if (input.type === 'checkbox') {
                value.className = `payments-export-check ${input.checked ? 'is-checked' : ''}`;
                value.textContent = input.checked ? '✓' : '—';
            } else {
                value.className = 'payments-export-value';
                value.textContent = input.value === '' ? '—' : Payments.currency(Number(input.value));
            }
            input.replaceWith(value);
        });
        snapshot.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        snapshot.style.width = `${Math.max(1100, Math.ceil(page.getBoundingClientRect().width))}px`;
        document.body.appendChild(snapshot);
        if (document.fonts?.ready) await document.fonts.ready;
        const width = snapshot.scrollWidth;
        const height = snapshot.scrollHeight;
        // Keep long company lists within browser canvas limits, without cropping rows.
        const scale = Math.min(2, 16000 / Math.max(width, height), Math.sqrt(24000000 / (width * height)));
        const canvas = await html2canvas(snapshot, {
            scale, backgroundColor: '#ffffff', useCORS: true, logging: false,
            width, height, windowWidth: Math.max(1280, width), windowHeight: height,
            onclone(doc) {
                const clone = doc.querySelector('.payments-export-snapshot');
                clone.style.position = 'static';
                clone.style.margin = '0';
                doc.body.style.overflow = 'visible';
                doc.body.style.height = 'auto';
                doc.body.style.display = 'block';
            }
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        if (!blob) throw new Error('JPG oluşturulamadı.');
        imageUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `Odemeler-${month}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        if (status?.isConnected) status.textContent = 'JPG hazır. İndirme başlatıldı.';
    } catch (error) {
        console.error('Ödemeler JPG hatası:', error);
        if (status?.isConnected) status.textContent = 'JPG indirilemedi. Bağlantınızı kontrol edip tekrar deneyin.';
    } finally {
        snapshot?.remove();
        if (imageUrl) setTimeout(() => URL.revokeObjectURL(imageUrl), 10000);
        button.disabled = false;
        button.innerHTML = originalLabel;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Payments;
