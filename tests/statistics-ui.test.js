const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
    const elements = new Map();
    const element = () => ({ innerHTML: '', value: '', textContent: '', disabled: false, addEventListener() {}, reportValidity: () => true });
    const main = element();
    let html = '';
    Object.defineProperty(main, 'innerHTML', { get: () => html, set(value) {
        html = value;
        for (const match of value.matchAll(/id="([^"]+)"[^>]*?(?:value="([^"]*)")?[^>]*>/g)) elements.set(match[1], element());
    }});
    elements.set('main-content', main);
    const rows = {
        users: [{ docId: 'admin-doc', id: 'admin', role: 'Admin', name: 'Admin' }, { docId: 'staff-doc', id: 'staff', role: 'Yönetici', name: 'Ayşe' }],
        tasks: [{ holding: 'RDGRUP MEDYA', tarih: '2025-09-01', tur: 'Tasarım', adet: 3, hazirlayan: 'Ayşe', hazirlandi: true }],
        checklists: [], statistics_adjustments: []
    };
    let fail = false, delay = null;
    const context = vm.createContext({
        console: { error() {} }, PanelStatistics: require('../js/statistics-core'),
        currentUser: { id: 'admin', docId: 'admin-doc', role: 'Admin' }, dbUsers: rows.users,
        activePage: 'İstatistik', currentCompany: 'RDGRUP MEDYA',
        document: { getElementById: id => elements.get(id), querySelector: () => null },
        db: { collection(name) {
            const query = filters => ({
                where(key, op, value) { return query([...filters, [key, value]]); },
                async get() { if (fail) throw Error('offline'); if (delay) await delay; const data = (rows[name] || []).filter(row => filters.every(([key, value]) => row[key] === value)); return { forEach(fn) { data.forEach(row => fn({ id: row.docId, data: () => row })); } }; },
                doc(id) { return {
                    async get() { const row = rows[name].find(r => r.docId === id); return { exists: !!row, data: () => row }; },
                    async set(data) { if (fail) throw Error('offline'); const index = rows[name].findIndex(r => r.docId === id); const row = { ...data, docId: id }; if (index < 0) rows[name].push(row); else rows[name][index] = row; }
                }; }
            });
            return query([]);
        }}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/statistics.js'), 'utf8'), context);
    vm.runInContext("statisticsMonth = '2025-09'", context);
    return { context, main, elements, rows, setFail(value) { fail = value; }, setDelay(value) { delay = value; } };
}
test('Admin veritabanındaki rolle doğrulanır; yönetici/yerel rol değişikliği erişim vermez', async () => {
    const { context, main } = setup();
    assert.equal(context.isStatisticsAdmin(), true);
    context.currentUser = { id: 'staff', docId: 'staff-doc', role: 'Admin' };
    assert.equal(context.isStatisticsAdmin(), false);
    await context.loadStatisticsPage();
    assert.equal(main.innerHTML, '');
    context.currentUser = { id: 'admin', docId: 'yanlış', role: 'Admin' };
    assert.equal(context.isStatisticsAdmin(), false);
});
test('Aylık ekran boş dönem, hata ve yeniden denemeyi ayrıştırır', async () => {
    const state = setup();
    await state.context.loadStatisticsPage();
    assert.match(state.main.innerHTML, /stats-design/);
    assert.match(state.main.innerHTML, /<strong>3<\/strong>/);
    assert.match(state.main.innerHTML, /Geçmiş Ay Verisi Ekle/);
    state.setFail(true);
    await state.context.loadStatisticsPage();
    assert.match(state.main.innerHTML, /İstatistikler alınamadı/);
    assert.doesNotMatch(state.main.innerHTML, /stats-totals/);
    state.setFail(false);
    vm.runInContext("statisticsMonth = '2025-08'", state.context);
    await state.context.loadStatisticsPage();
    assert.match(state.main.innerHTML, /Bu ay için kayıt bulunamadı/);
});
test('Sayfa ve ay değişirken geç tamamlanan sorgu ekranı ezmez', async () => {
    const state = setup();
    let resolve;
    state.setDelay(new Promise(r => { resolve = r; }));
    const pending = state.context.loadStatisticsPage();
    state.context.activePage = 'Kendi İşlerim';
    state.main.innerHTML = 'Diğer sayfa';
    resolve(); await pending;
    assert.equal(state.main.innerHTML, 'Diğer sayfa');
    state.context.activePage = 'İstatistik';
    state.setDelay(null);
    await state.context.loadStatisticsPage();
    assert.match(state.main.innerHTML, /stats-table/);
});
test('Geçmiş veri tekrar kaydetmede değiştirilir; negatif ve admin dışı yazma engellenir', async () => {
    const state = setup();
    await state.context.loadStatisticsPage();
    const fill = count => {
        state.elements.get('statistics-history-user').value = 'staff';
        for (const key of ['checklist', 'design', 'video', 'share']) state.elements.get(`statistics-history-${key}`).value = key === 'design' ? String(count) : '0';
        state.elements.get('statistics-history-note').value = 'Eski arşiv';
    };
    const event = { preventDefault() {} };
    fill(4); await state.context.saveStatisticsHistory(event);
    assert.equal(state.rows.statistics_adjustments.length, 1);
    assert.equal(state.rows.statistics_adjustments[0].design, 4);
    assert.match(state.main.innerHTML, /<strong>7<\/strong>/);
    fill(5); await state.context.saveStatisticsHistory(event);
    assert.equal(state.rows.statistics_adjustments.length, 1);
    assert.equal(state.rows.statistics_adjustments[0].design, 5);
    fill(-1); await state.context.saveStatisticsHistory(event);
    assert.equal(state.rows.statistics_adjustments[0].design, 5);
    state.context.currentUser = { id: 'staff', role: 'Admin' };
    fill(10); await state.context.saveStatisticsHistory(event);
    assert.equal(state.rows.statistics_adjustments[0].design, 5);
});
test('Veri metni HTML olarak çalıştırılmaz', () => {
    const { context } = setup();
    assert.equal(context.statisticsEscape('<img src=x onerror="attack()">'), '&lt;img src=x onerror=&quot;attack()&quot;&gt;');
});

test('Mevcut panelin özel alperen admin hesabı korunur; diğer yönetici hesapları hariçtir', async () => {
    const state = setup();
    state.rows.users.push({ id: 'alperen', docId: 'alperen-doc', role: 'Yönetici', name: 'Alperen' });
    state.context.currentUser = { id: 'alperen', docId: 'alperen-doc', role: 'Yönetici' };
    assert.equal(state.context.isStatisticsAdmin(), true);
    await state.context.loadStatisticsPage();
    assert.match(state.main.innerHTML, /stats-table/);
    state.elements.get('statistics-history-user').value = 'staff';
    for (const key of ['checklist', 'design', 'video', 'share']) state.elements.get(`statistics-history-${key}`).value = '1';
    state.elements.get('statistics-history-note').value = '';
    await state.context.saveStatisticsHistory({ preventDefault() {} });
    assert.equal(state.rows.statistics_adjustments.length, 1);
    state.context.currentUser = { id: 'staff', docId: 'staff-doc' };
    assert.equal(state.context.isStatisticsAdmin(), false);
});
