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
    currency(value) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value); },
    escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
};

let paymentsMonth = Payments.monthKey();
let paymentsRequest = 0;
const paymentsSaveQueues = new Map();

function paymentsControls() {
    return `<div class="payments-toolbar"><div><h2 class="content-title">Ödemeler</h2><p>Firmaların aylık ödeme ve evrak takibi</p></div><div class="payments-month-controls"><button type="button" class="action-btn" onclick="changePaymentsMonth(-1)" aria-label="Önceki ay"><i class="fa-solid fa-chevron-left"></i></button><label for="payments-month">Dönem</label><input id="payments-month" type="month" min="1000-01" max="9999-12" value="${paymentsMonth}" onchange="setPaymentsMonth(this.value)"><button type="button" class="action-btn" onclick="changePaymentsMonth(1)" aria-label="Sonraki ay"><i class="fa-solid fa-chevron-right"></i></button><button type="button" class="login-btn btn-light" onclick="setPaymentsMonth(Payments.monthKey())">Bu Ay</button></div></div>`;
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
    return `<tr data-company-id="${id}"><th scope="row">${name}<small class="payments-row-status" role="status"></small></th><td><div class="payments-amount"><input data-field="amount" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" value="${Payments.escape(amount)}" aria-label="${name}: Ödeme Tutarı" placeholder="0,00"><button type="button" data-action="vat" class="payments-vat ${vat ? 'is-active' : ''}" aria-pressed="${vat}" aria-label="${name}: %20 KDV">${vat ? '+%20 KDV' : 'KDV ekle'}</button></div><small class="payments-total">${amount === '' ? 'Toplam: —' : `Toplam: ${Payments.currency(Payments.total(amount, vat))}`}</small></td>${check('hasInvoice', 'Fatura var mı')}${check('reportSent', 'Rapor İletildi')}${check('paymentOrInvoiceSent', 'Ödeme/Fatura İletildi')}${check('paymentReceived', 'Ödeme geldi')}<td><input data-field="pastDebt" type="number" min="0" max="1000000000000" step="0.01" inputmode="decimal" value="${Payments.escape(debt)}" aria-label="${name}: Geçmiş kalan borç" placeholder="0,00"></td></tr>`;
}

async function loadPaymentsPage() {
    if (!isStatisticsAdmin()) return;
    const request = ++paymentsRequest;
    const month = paymentsMonth;
    const container = document.getElementById('main-content');
    container.innerHTML = `<section class="content-card payments-page">${paymentsControls()}<div class="payments-message" role="status">Ödemeler yükleniyor...</div></section>`;
    try {
        const snapshot = await db.collection('payment_tracking').where('month', '==', month).get();
        if (request !== paymentsRequest || activePage !== 'Ödemeler' || !isStatisticsAdmin()) return;
        const records = new Map();
        snapshot.forEach(doc => { const entry = doc.data(); if (entry.companyId) records.set(String(entry.companyId), entry); });
        const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        const rows = dbCompanies.filter(c => c.docId).map(c => paymentsRow(c, records.get(c.docId))).join('');
        container.innerHTML = `<section class="content-card payments-page">${paymentsControls()}<div class="payments-heading"><h3>${Payments.escape(label)}</h3><button type="button" class="login-btn btn-light" onclick="loadPaymentsPage()"><i class="fa-solid fa-rotate"></i> Yenile</button></div><div class="payments-summary" id="payments-summary"></div><div class="payments-table-scroll"><table class="payments-table"><thead><tr><th scope="col">Firma İsmi</th><th scope="col">Ödeme Tutarı</th><th scope="col">Fatura var mı</th><th scope="col">Rapor İletildi</th><th scope="col">Ödeme/Fatura İletildi</th><th scope="col">Ödeme geldi</th><th scope="col">Geçmiş kalan borç</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="payments-message">Firmalar sayfasında kayıtlı firma bulunamadı.</td></tr>'}</tbody></table></div><p class="payments-hint">Tutar ve geçmiş borç ayrı girilir. KDV seçilirse ödeme toplamına %20 eklenir. Değişiklikler otomatik kaydedilir.</p></section>`;
        const table = container.querySelector('.payments-table');
        table.addEventListener('click', event => {
            const button = event.target.closest('[data-action="vat"]');
            if (!button) return;
            const enabled = button.getAttribute('aria-pressed') !== 'true';
            button.setAttribute('aria-pressed', String(enabled));
            button.classList.toggle('is-active', enabled);
            button.textContent = enabled ? '+%20 KDV' : 'KDV ekle';
            updatePaymentsSummary();
            savePaymentRow(button.closest('tr'));
        });
        table.addEventListener('input', event => { if (event.target.matches('input[data-field]')) updatePaymentsSummary(); });
        table.addEventListener('change', event => { if (event.target.matches('input[data-field]')) savePaymentRow(event.target.closest('tr')); });
        updatePaymentsSummary();
    } catch (error) {
        if (request !== paymentsRequest || activePage !== 'Ödemeler') return;
        console.error('Ödemeler yükleme hatası:', error);
        container.innerHTML = `<section class="content-card payments-page">${paymentsControls()}<p class="payments-message" role="alert">Ödemeler alınamadı. Bağlantınızı ve veritabanı izinlerini kontrol edin.</p><button type="button" class="login-btn btn-light" onclick="loadPaymentsPage()">Tekrar Dene</button></section>`;
    }
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
    summary.innerHTML = `<span><strong>${rows.length}</strong> firma</span><span>Aylık toplam: <strong>${Payments.currency(total)}</strong></span><span>Ödemesi gelen: <strong>${received}</strong></span><span>Geçmiş kalan borç: <strong>${Payments.currency(debt)}</strong></span>`;
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

if (typeof module !== 'undefined' && module.exports) module.exports = Payments;
