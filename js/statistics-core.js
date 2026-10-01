(function (root) {
    'use strict';
    const fields = ['checklist', 'design', 'video', 'share'];
    const empty = () => Object.fromEntries(fields.map(key => [key, 0]));
    const norm = value => String(value || '').replace(/\s+/g, '').toLocaleLowerCase('tr-TR');
    function monthKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    function validMonth(value) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000; }
    function shiftMonth(value, direction) {
        if (!validMonth(value)) throw new Error('Geçersiz ay');
        return monthKey(new Date(Number(value.slice(0, 4)), Number(value.slice(5)) - 1 + direction, 1));
    }
    function quantity(value) {
        const count = Number(value);
        return Number.isSafeInteger(count) && count > 0 ? count : 1;
    }
    function aggregate({ month, company, users = [], tasks = [], checklists = [], adjustments = [] }) {
        if (!validMonth(month)) throw new Error('Geçersiz ay');
        const rows = new Map();
        const addRow = (key, label) => {
            if (!rows.has(key)) rows.set(key, { key, label, automatic: empty(), manual: empty(), total: empty() });
            return rows.get(key);
        };
        const byId = id => {
            const user = users.find(u => String(u.id) === String(id));
            return addRow(`user:${id}`, user ? `${user.name || 'İsimsiz'} ${user.surname || ''}`.trim() : `Eski kullanıcı (${id})`);
        };
        const byName = name => {
            const matches = users.filter(u => norm(u.name) === norm(name) || norm(`${u.name || ''} ${u.surname || ''}`) === norm(name));
            if (name && matches.length === 1) return byId(matches[0].id);
            return addRow(`name:${norm(name) || 'unassigned'}`, name ? `${name}${matches.length > 1 ? ' (isim eşleşmesi belirsiz)' : ' (eski kullanıcı)'}` : 'Kişi belirtilmemiş');
        };
        users.filter(u => (u.repCompanies || []).includes(company)).forEach(u => byId(u.id));
        checklists.filter(c => norm(c.company) === norm(company) && String(c.date || '').startsWith(month + '-')).forEach(c => {
            Object.entries(c.notes || {}).forEach(([id, text]) => {
                const count = String(text || '').split(/\r?\n/).filter(line => line.replace(/^\s*\d+[-.)]\s*/, '').trim()).length;
                if (count) byId(id).automatic.checklist += count;
            });
        });
        tasks.filter(t => norm(t.holding || t.firma) === norm(company) && String(t.tarih || '').startsWith(month + '-') && (!t.category || t.category === 'rdgrup_paylasim')).forEach(t => {
            const count = quantity(t.adet);
            if (t.hazirlandi === true && (t.tur === 'Tasarım' || t.tur === 'Video')) byName(t.hazirlayan).automatic[t.tur === 'Video' ? 'video' : 'design'] += count;
            if (t.paylasildi === true) byName(t.paylasan).automatic.share += count;
        });
        adjustments.filter(a => a.company === company && a.month === month).forEach(a => {
            if (!a.userId) return;
            const row = byId(a.userId);
            fields.forEach(key => {
                const value = Number(a[key]);
                if (Number.isSafeInteger(value) && value >= 0) row.manual[key] += value;
            });
        });
        const totals = empty();
        rows.forEach(row => fields.forEach(key => { row.total[key] = row.automatic[key] + row.manual[key]; totals[key] += row.total[key]; }));
        return { rows: Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr')), totals };
    }
    const api = { fields, empty, monthKey, validMonth, shiftMonth, quantity, aggregate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PanelStatistics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
