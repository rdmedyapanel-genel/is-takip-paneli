const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
    const saved = new Map();
    const table = { addEventListener() {} };
    const main = { innerHTML: '', querySelector: () => table };
    const users = [{ docId: 'admin-doc', id: 'admin', role: 'admin' }];
    let allow = true;
    const context = vm.createContext({
        console: { error() {} }, currentUser: { id: 'admin', docId: 'admin-doc' }, dbUsers: users,
        dbCompanies: [{ docId: 'firm/1', name: '<Firma & A>' }], activePage: 'Ödemeler',
        isStatisticsAdmin: () => allow, statisticsUserIsAdmin: user => user?.role === 'admin',
        document: { getElementById: id => id === 'main-content' ? main : null, querySelectorAll: () => [] },
        db: { collection(name) {
            return {
                where(_field, _operator, month) { return { async get() { return { forEach(fn) { for (const [id, row] of saved) if (row.month === month) fn({ id, data: () => row }); } }; } }; },
                doc(id) { return {
                    async get() { const row = users.find(user => user.docId === id); return { exists: !!row, data: () => row }; },
                    async set(row) { if (name === 'payment_tracking') saved.set(id, row); }
                }; }
            };
        }}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/payments.js'), 'utf8'), context);
    vm.runInContext("paymentsMonth = '2026-10'", context);
    return { context, main, saved, setAdmin(value) { allow = value; } };
}

test('firmalar from Firmalar appear escaped in selected month, including future months', async () => {
    const app = setup();
    await app.context.loadPaymentsPage();
    assert.match(app.main.innerHTML, /&lt;Firma &amp; A&gt;/);
    assert.match(app.main.innerHTML, /Fatura var mı/);
    app.context.setPaymentsMonth('2027-03');
    await new Promise(setImmediate);
    assert.match(app.main.innerHTML, /2027-03/);
    app.setAdmin(false);
    app.main.innerHTML = 'Başka ekran';
    await app.context.loadPaymentsPage();
    assert.equal(app.main.innerHTML, 'Başka ekran');
});

test('row save keeps company and month distinct and verifies current admin', async () => {
    const app = setup();
    const inputs = { amount: { value: '1000' }, pastDebt: { value: '150' },
        hasInvoice: { checked: true }, reportSent: { checked: false }, paymentOrInvoiceSent: { checked: true }, paymentReceived: { checked: false } };
    const status = { textContent: '', className: '' };
    const row = { dataset: { companyId: 'firm/1' }, isConnected: true,
        querySelector(selector) {
            if (selector === '.payments-row-status') return status;
            if (selector === '[data-action="vat"]') return { getAttribute: () => 'true' };
            return inputs[selector.match(/data-field="([^"]+)"/)[1]];
        } };
    app.context.savePaymentRow(row);
    await new Promise(setImmediate);
    assert.equal(app.saved.get('firm%2F1__2026-10').amount, 1000);
    assert.equal(app.saved.get('firm%2F1__2026-10').vat, true);
    assert.equal(app.saved.get('firm%2F1__2026-10').pastDebt, 150);
    assert.equal(status.textContent, 'Kaydedildi');
    inputs.amount.value = '2500';
    app.context.setPaymentsMonth('2026-11');
    app.context.savePaymentRow(row);
    await new Promise(setImmediate);
    assert.equal(app.saved.get('firm%2F1__2026-10').amount, 1000);
    assert.equal(app.saved.get('firm%2F1__2026-11').amount, 2500);
    app.context.dbUsers[0].role = 'staff';
    inputs.amount.value = '3000';
    app.context.savePaymentRow(row);
    await new Promise(setImmediate);
    assert.equal(app.saved.get('firm%2F1__2026-11').amount, 2500);
    assert.match(status.textContent, /Kaydedilemedi/);
});
