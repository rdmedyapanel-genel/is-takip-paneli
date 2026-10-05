const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
    const saved = new Map();
    let settings = null;
    const elements = new Map();
    const table = { addEventListener() {} };
    const main = { innerHTML: '', querySelector: () => table };
    const users = [{ docId: 'admin-doc', id: 'admin', role: 'admin' }];
    const roles = [];
    let backendUser = null;
    const context = vm.createContext({
        console: { error() {} }, currentUser: { id: 'admin', docId: 'admin-doc' }, dbUsers: users,
        dbCompanies: [{ docId: 'firm/1', name: '<Firma & A>' }, { docId: 'firm-2', name: 'Firma B' }], activePage: 'Ödemeler',
        statisticsUserIsAdmin: user => user?.role?.toLowerCase() === 'admin' || user?.id === 'alperen',
        document: { getElementById: id => id === 'main-content' ? main : elements.get(id) || null, querySelectorAll: () => [] },
        db: { collection(name) {
            return {
                async get() { return { forEach(fn) { roles.forEach(role => fn({ id: role.docId, data: () => role })); } }; },
                where(_field, _operator, month) { return { async get() { return { forEach(fn) { for (const [id, row] of saved) if (row.month === month) fn({ id, data: () => row }); } }; } }; },
                doc(id) { return {
                    async get() { const row = name === 'payment_settings' ? settings : backendUser || users.find(user => user.docId === id); return { exists: !!row, data: () => row }; },
                    async set(row) { if (name === 'payment_tracking') saved.set(id, row); if (name === 'payment_settings') settings = row; }
                }; }
            };
        }}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/payments.js'), 'utf8'), context);
    vm.runInContext("paymentsMonth = '2026-10'", context);
    return { context, main, saved, elements, roles, getSettings() { return settings; }, setAdmin(value) { users[0].role = value ? 'admin' : 'staff'; }, setBackendUser(value) { backendUser = value; } };
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
    app.setBackendUser({ id: 'admin', role: 'staff' });
    inputs.amount.value = '3000';
    app.context.savePaymentRow(row);
    await new Promise(setImmediate);
    assert.equal(app.saved.get('firm%2F1__2026-11').amount, 2500);
    assert.match(status.textContent, /Kaydedilemedi/);
});

test('Firmaları Düzenle hides selected firms across months without deleting payment records', async () => {
    const app = setup();
    await app.context.loadPaymentsPage();
    assert.match(app.main.innerHTML, /Firma B/);
    app.elements.set('payments-company-editor', { querySelectorAll: () => [{ value: 'firm/1' }] });
    app.elements.set('payments-company-save', { disabled: false });
    app.elements.set('payments-company-status', { textContent: '' });
    await app.context.savePaymentsCompanies();
    assert.deepEqual([...app.getSettings().hiddenCompanyIds], ['firm-2']);
    assert.doesNotMatch(app.main.innerHTML, /data-company-id="firm-2"/);
    assert.match(app.main.innerHTML, /Firmaları Düzenle/);
    app.context.setPaymentsMonth('2027-01');
    await new Promise(setImmediate);
    assert.doesNotMatch(app.main.innerHTML, /data-company-id="firm-2"/);
});

test('payment received alone marks a row complete and unchecking it restores the active state', () => {
    const app = setup();
    const payments = vm.runInContext('Payments', app.context);
    const complete = { hasInvoice: false, reportSent: false, paymentOrInvoiceSent: false, paymentReceived: true };
    assert.equal(payments.completed(complete), true);
    assert.match(app.context.paymentsRow({ docId: 'firm-2', name: 'Firma B' }, complete), /class="is-complete"/);
    complete.paymentReceived = false;
    assert.equal(payments.completed(complete), false);
    const classes = new Set(['is-complete']);
    const label = { hidden: false };
    const row = { querySelectorAll: () => [], classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } },
        querySelector(selector) { if (selector === '.payments-vat-options') return {}; return selector === '.payments-complete-label' ? label : { checked: complete[selector.match(/data-field="([^"]+)"/)[1]] }; } };
    app.context.updatePaymentsRowState(row);
    assert.equal(classes.has('is-complete'), false);
    assert.equal(label.hidden, true);
});


test('VAT choices require an invoice and retain the stored choice when disabled', () => {
    const app = setup();
    for (const hasInvoice of [false, true]) {
        const html = app.context.paymentsRow({ docId: 'firm-2', name: 'Firma B' }, { amount: 1000, vat: true, hasInvoice });
        for (const action of ['vat-included', 'vat']) {
            const button = html.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`))[0];
            assert.equal(/ disabled/.test(button), !hasInvoice);
        }
        assert.match(html, /aria-pressed="true" aria-label="Firma B: \+ %20 KDV"/);
        assert.match(html, /value="1000"/);
        assert.doesNotMatch(html, /payments-total|Toplam:/);
    }
    const fields = { hasInvoice: { checked: true }, reportSent: { checked: false }, paymentOrInvoiceSent: { checked: false }, paymentReceived: { checked: false } };
    const buttons = [{ disabled: true, selected: false }, { disabled: true, selected: true }];
    const group = {}, label = {};
    const row = { classList: { toggle() {} }, querySelectorAll: () => buttons,
        querySelector(selector) {
            if (selector === '.payments-vat-options') return group;
            if (selector === '.payments-complete-label') return label;
            return fields[selector.match(/data-field="([^"]+)"/)[1]];
        }
    };
    app.context.updatePaymentsRowState(row);
    assert.ok(buttons.every(button => !button.disabled));
    fields.hasInvoice.checked = false;
    app.context.updatePaymentsRowState(row);
    assert.ok(buttons.every(button => button.disabled));
    assert.equal(buttons[1].selected, true);
});


test('payments screen omits summary cards and row totals', async () => {
    const app = setup();
    await app.context.loadPaymentsPage();
    assert.doesNotMatch(app.main.innerHTML, /payments-summary|payments-stat|payments-total|Aylık toplam/);
    assert.match(app.main.innerHTML, /JPG olarak indir/);
});


test('Ödemeler is available in the title permissions editor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../admin/index.html'), 'utf8');
    const pages = JSON.parse(html.match(/const medyaPages = (\[[^;]+\]);/)[1]);
    assert.ok(pages.includes('Ödemeler'));
});

test('stored role permission controls access, local role spoofing cannot grant access', async () => {
    const app = setup();
    app.setAdmin(false);
    app.context.currentUser.role = 'admin';
    assert.equal(app.context.hasPaymentsAccess(), false);
    app.context.dbUsers[0].role = 'Muhasebe';
    app.roles.push({ docId: 'accounts-role', name: 'Muhasebe', pages: ['Ödemeler'] });
    await app.context.fetchPaymentsRoles();
    assert.equal(app.context.hasPaymentsAccess(), true);
    await app.context.loadPaymentsPage();
    assert.match(app.main.innerHTML, /payments-table/);
    // The saved user can edit the payment page's company selection as well.
    app.elements.set('payments-company-editor', { querySelectorAll: () => [{ value: 'firm/1' }] });
    app.elements.set('payments-company-save', { disabled: false });
    app.elements.set('payments-company-status', { textContent: '' });
    await app.context.savePaymentsCompanies();
    assert.deepEqual([...app.getSettings().hiddenCompanyIds], ['firm-2']);
    // Revocation in the database is checked even while the menu still has a cached grant.
    app.roles[0].pages = [];
    await assert.rejects(app.context.verifyPaymentsAccess(), /yetkisi bulunamadı/);
    await app.context.loadPaymentsPage();
    assert.doesNotMatch(app.main.innerHTML, /payments-table/);
    await app.context.fetchPaymentsRoles();
    assert.equal(app.context.hasPaymentsAccess(), false);
});

test('explicit role grants permit payment saves, revoked grants cannot write', async () => {
    const app = setup();
    app.context.dbUsers[0].role = 'Muhasebe';
    app.roles.push({ docId: 'accounts-role', name: 'Muhasebe', pages: ['Ödemeler'] });
    await app.context.fetchPaymentsRoles();
    const fields = { amount: { value: '1000' }, pastDebt: { value: '0' }, hasInvoice: { checked: true },
        reportSent: { checked: false }, paymentOrInvoiceSent: { checked: false }, paymentReceived: { checked: true } };
    const status = {};
    const row = { dataset: { companyId: 'firm/1' }, isConnected: true, querySelector(selector) {
        if (selector === '.payments-row-status') return status;
        if (selector === '[data-action="vat"]') return { getAttribute: () => 'false' };
        return fields[selector.match(/data-field="([^"]+)"/)[1]];
    } };
    app.context.savePaymentRow(row);
    await new Promise(setImmediate);
    assert.equal(app.saved.get('firm%2F1__2026-10').amount, 1000);
    app.roles[0].pages = [];
    fields.amount.value = '5000';
    app.context.savePaymentRow(row);
    await new Promise(setImmediate);
    assert.equal(app.saved.get('firm%2F1__2026-10').amount, 1000);
    assert.match(status.textContent, /Kaydedilemedi/);
});

test('admin access remains available without role documents', () => {
    const app = setup();
    assert.equal(app.context.hasPaymentsAccess(), true);
    assert.equal(app.context.paymentsRoleAllows({ id: 'alperen', role: 'Yönetici' }), true);
    assert.equal(app.context.paymentsRoleAllows({ id: 'someone', role: 'Yönetici' }), false);
});
