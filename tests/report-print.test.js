const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup({ decodeFailure = false } = {}) {
    const styleValues = new Map();
    const style = { setProperty(k, v) { styleValues.set(k, v); }, getPropertyValue(k) { return styleValues.get(k) || ''; } };
    const cover = { child: null, querySelector() { return this.child; }, replaceChildren(img) { this.child = img; } };
    const donut = { style: { ...style, setProperty: (k, v) => styleValues.set('donut:' + k, v), getPropertyValue: k => styleValues.get('donut:' + k) || '' } };
    const modal = { style, querySelector(s) { return s === '.nr-cover-logo' ? cover : donut; }, querySelectorAll() { return cover.child ? [cover.child] : []; } };
    let printed = 0, errors = [];
    const ctx2d = { drawImage() {}, fillRect() {}, beginPath() {}, moveTo() {}, arc() {}, closePath() {}, fill() {}, set globalCompositeOperation(v) {}, set fillStyle(v) {} };
    class ImageMock { naturalWidth = 300; naturalHeight = 150; crossOrigin = ''; decode() { return decodeFailure ? Promise.reject(Error('bad image')) : Promise.resolve(); } }
    const context = vm.createContext({
        console: { error() {} }, setTimeout, clearTimeout, Image: ImageMock,
        dbReportCompanies: [{ docId: 'x', name: 'Firma', reportLogo: 'data:image/png;base64,ZmFrZQ==' }],
        document: { title: 'Panel', fonts: { ready: Promise.resolve() }, getElementById: () => modal,
            createElement(tag) { return tag === 'canvas' ? { getContext: () => ctx2d, toDataURL: () => 'data:image/png;base64,cHJpbnQ=' } : { dataset: {}, decode: () => Promise.resolve() }; } },
        window: { addEventListener() {}, print() { printed++; } }, alert(message) { errors.push(message); }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/report-builder.js'), 'utf8'), context);
    vm.runInContext("rbState = rbEmptyState('x','2026-09'); rbState.likes=75; rbState.comments=25;", context);
    return { context, modal, cover, styleValues, get printed() { return printed; }, errors };
}
test('PDF logosu ve halka grafiği PNG katmanına dönüştürülür; baskıdan önce font ve görseller beklenir', async () => {
    const s = setup();
    await s.context.rbPrintReport();
    assert.equal(s.printed, 1);
    assert.equal(s.cover.child.src, 'data:image/png;base64,cHJpbnQ=');
    assert.equal(s.cover.child.dataset.rbPrintLogo, 'true');
    assert.match(s.styleValues.get('donut:--nr-print-donut'), /^url\("data:image\/png;base64,/);
    assert.match(s.styleValues.get('--nr-print-cover'), /^rgb\(/);
    assert.match(s.context.document.title, /Firma 2026 - Eylül Ayı Aylık Rapor/);
    await s.context.rbPrintReport();
    assert.equal(s.printed, 2);
    assert.equal(s.errors.length, 0);
});
test('Logo dönüştürülemezse bozuk PDF çıktısı almadan anlaşılır hata gösterilir', async () => {
    const s = setup({ decodeFailure: true });
    await s.context.rbPrintReport();
    assert.equal(s.printed, 0);
    assert.equal(s.context.document.title, 'Panel');
    assert.match(s.errors[0], /Logo.*PNG veya JPG/);
});
test('Baskı renkleri geçerli RGB değerleridir; bozuk giriş güvenli renge döner', () => {
    const s = setup();
    assert.deepEqual(Array.from(s.context.rbPrintRgb('#abc')), [170, 187, 204]);
    assert.deepEqual(Array.from(s.context.rbPrintRgb('unknown')), [54, 58, 168]);
});
