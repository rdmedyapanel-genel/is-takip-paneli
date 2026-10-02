const test = require('node:test');
const assert = require('node:assert/strict');
const Payments = require('../js/payments.js');

test('month selection supports previous and future years', () => {
    assert.equal(Payments.shiftMonth('2026-01', -1), '2025-12');
    assert.equal(Payments.shiftMonth('2026-12', 1), '2027-01');
    assert.equal(Payments.shiftMonth('9999-12', 1), '9999-12');
    assert.equal(Payments.validMonth('2026-13'), false);
});

test('each company and month has a distinct safe document key', () => {
    assert.notEqual(Payments.docId('firma/a', '2026-10'), Payments.docId('firma/a', '2026-11'));
    assert.notEqual(Payments.docId('firma/a', '2026-10'), Payments.docId('firma-b', '2026-10'));
    assert.equal(Payments.docId('firma/a', '2026-10'), 'firma%2Fa__2026-10');
});

test('VAT is added once to payment amount and blank differs from zero', () => {
    assert.equal(Payments.total(Payments.parseAmount('1000'), true), 1200);
    assert.equal(Payments.total(Payments.parseAmount('99.99'), true), 119.99);
    assert.equal(Payments.total(Payments.parseAmount('0'), false), 0);
    assert.equal(Payments.total(Payments.parseAmount(''), true), null);
    assert.throws(() => Payments.parseAmount('-1'));
    assert.throws(() => Payments.parseAmount('12.345'));
});

test('company names are escaped in generated markup', () => {
    assert.equal(Payments.escape('<Firma "A">'), '&lt;Firma &quot;A&quot;&gt;');
});
