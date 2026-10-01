const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../js/statistics-core');
const company = 'RDGRUP MEDYA';
const users = [{ id: 'a', name: 'Ayşe', surname: 'Yılmaz', repCompanies: [company] }, { id: 'b', name: 'Bora', repCompanies: [company] }];
const aggregate = overrides => stats.aggregate({ month: '2026-09', company, users, ...overrides });
test('Hazırlama ve paylaşma bağımsız sayılır, görev adedi kullanılır; diğer ay ve şirket hariçtir', () => {
    const base = { holding: company, category: 'rdgrup_paylasim', tarih: '2026-09-12', hazirlayan: 'Ayşe', paylasan: 'Bora', adet: 3, tur: 'Tasarım' };
    const result = aggregate({ tasks: [
        { ...base, hazirlandi: true, paylasildi: false },
        { ...base, hazirlandi: false, paylasildi: true, adet: 2, tur: 'Video' },
        { ...base, hazirlandi: true, paylasildi: true, tur: 'Video', adet: 4 },
        { ...base, hazirlandi: true, paylasildi: true, tur: 'Fotoğraf', adet: 2 },
        { ...base, hazirlandi: true, holding: 'Diğer' },
        { ...base, hazirlandi: true, tarih: '2026-08-31' },
        { ...base, hazirlandi: true, category: 'başka' }
    ] });
    assert.deepEqual(result.totals, { checklist: 0, design: 3, video: 4, share: 8 });
    assert.equal(result.rows.find(r => r.key === 'user:a').total.share, 0);
    assert.equal(result.rows.find(r => r.key === 'user:b').total.share, 8);
});
test('Checklist dolu maddeleri sayar; geçmiş ek veri ayrı olarak toplama eklenir', () => {
    const result = aggregate({ checklists: [
        { company, date: '2026-09-01', notes: { a: '1- Bir\n\n2- İki\n3- ', removed: 'Eski çalışanın maddesi' } },
        { company, date: '2026-08-31', notes: { a: 'Sayılmamalı' } },
        { company: 'Diğer', date: '2026-09-01', notes: { a: 'Sayılmamalı' } }
    ], adjustments: [{ company, month: '2026-09', userId: 'a', checklist: 5, design: 2, video: 3, share: 4 }, { company, month: '2026-08', userId: 'a', design: 99 }] });
    assert.deepEqual(result.totals, { checklist: 8, design: 2, video: 3, share: 4 });
    assert.equal(result.rows.find(r => r.key === 'user:a').automatic.checklist, 2);
    assert.equal(result.rows.find(r => r.key === 'user:a').manual.checklist, 5);
    assert.ok(result.rows.some(r => r.key === 'user:removed'));
});
test('Aynı isimli veya silinmiş personel ve boş kişi toplamları kaybolmaz / iki kez sayılmaz', () => {
    const result = aggregate({ users: [...users, { id: 'c', name: 'Ayşe' }], tasks: [
        { holding: company, tarih: '2026-09-01', hazirlandi: true, hazirlayan: 'Ayşe', tur: 'Video', adet: 2 },
        { holding: company, tarih: '2026-09-01', hazirlandi: true, hazirlayan: 'Eski', tur: 'Video' },
        { holding: company, tarih: '2026-09-01', paylasildi: true, paylasan: '' }
    ] });
    assert.equal(result.totals.video, 3);
    assert.equal(result.totals.share, 1);
    assert.ok(result.rows.some(r => r.label.includes('belirsiz')));
});
test('Ay geçişleri ay sonu ve yıl sınırlarında ay atlamaz', () => {
    assert.equal(stats.shiftMonth('2026-01', -1), '2025-12');
    assert.equal(stats.shiftMonth('2026-12', 1), '2027-01');
    assert.equal(stats.shiftMonth('2026-03', -1), '2026-02');
    assert.equal(stats.validMonth('2026-13'), false);
    assert.throws(() => stats.shiftMonth('hata', 1));
});
test('Boş ay sıfır gösterir; bozuk adet alanları mevcut varsayılan 1 ile sayılır', () => {
    assert.deepEqual(aggregate({}).totals, stats.empty());
    for (const value of [undefined, 'hata', -2, 0, 1.5]) assert.equal(stats.quantity(value), 1);
    assert.equal(stats.quantity('5'), 5);
});
