'use strict';
let statisticsMonth = PanelStatistics.monthKey();
let statisticsRequest = 0;
let statisticsAdjustments = [];
const statisticsLabels = { checklist: 'Checkliste Yazılan Madde', design: 'Hazırlanan Tasarım', video: 'Hazırlanan Video', share: 'Yapılan Paylaşım' };
const statisticsIcons = { checklist: 'fa-list-check', design: 'fa-pen-nib', video: 'fa-video', share: 'fa-share-nodes' };
function statisticsEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function statisticsUserIsAdmin(user) {
    return !!user && (String(user.role || '').trim().toLowerCase() === 'admin' || user.id === 'alperen');
}
function isStatisticsAdmin() {
    if (!currentUser) return false;
    // Use the loaded database role instead of trusting the role in localStorage.
    const user = dbUsers.find(u => u.id === currentUser.id && (!currentUser.docId || u.docId === currentUser.docId));
    return statisticsUserIsAdmin(user);
}
function statisticsMonthLabel(month) {
    return new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}
function setStatisticsMonth(month) {
    if (!isStatisticsAdmin() || !PanelStatistics.validMonth(month)) return;
    statisticsMonth = month;
    loadStatisticsPage();
}
function changeStatisticsMonth(direction) { setStatisticsMonth(PanelStatistics.shiftMonth(statisticsMonth, direction)); }
function statisticsControls() {
    return `<div class="stats-toolbar"><div><h2 class="content-title">İstatistik</h2><p>${statisticsEscape(currentCompany)} · Aylık iş özeti</p></div><div class="stats-month-controls"><button type="button" class="action-btn" onclick="changeStatisticsMonth(-1)" aria-label="Önceki ay"><i class="fa-solid fa-chevron-left"></i></button><label for="statistics-month">Dönem</label><input type="month" id="statistics-month" value="${statisticsMonth}" min="1000-01" max="9999-12" onchange="setStatisticsMonth(this.value)"><button type="button" class="action-btn" onclick="changeStatisticsMonth(1)" aria-label="Sonraki ay"><i class="fa-solid fa-chevron-right"></i></button><button type="button" class="login-btn btn-light" onclick="setStatisticsMonth(PanelStatistics.monthKey())">Bu Ay</button></div></div>`;
}
async function loadStatisticsPage() {
    if (!isStatisticsAdmin()) return;
    const request = ++statisticsRequest;
    const month = statisticsMonth, company = currentCompany;
    const container = document.getElementById('main-content');
    container.innerHTML = `<section class="content-card stats-page">${statisticsControls()}<div role="status" class="stats-message">İstatistikler yükleniyor...</div></section>`;
    try {
        const [taskSnapshot, checklistSnapshot, manualSnapshot] = await Promise.all([
            db.collection('tasks').get(),
            db.collection('checklists').where('company', '==', company).get(),
            db.collection('statistics_adjustments').where('company', '==', company).get()
        ]);
        if (request !== statisticsRequest || activePage !== 'İstatistik' || !isStatisticsAdmin()) return;
        const records = snapshot => { const result = []; snapshot.forEach(doc => result.push({ ...doc.data(), docId: doc.id })); return result; };
        const tasks = records(taskSnapshot), checklists = records(checklistSnapshot);
        statisticsAdjustments = records(manualSnapshot);
        const data = PanelStatistics.aggregate({ month, company, users: dbUsers, tasks, checklists, adjustments: statisticsAdjustments });
        const cards = PanelStatistics.fields.map(key => `<div class="stats-total stats-${key}"><i class="fa-solid ${statisticsIcons[key]}"></i><span>${statisticsLabels[key]}</span><strong>${data.totals[key].toLocaleString('tr-TR')}</strong></div>`).join('');
        const rowHtml = data.rows.map(row => `<tr><th scope="row">${statisticsEscape(row.label)}</th>${PanelStatistics.fields.map(key => `<td>${row.total[key].toLocaleString('tr-TR')}${row.manual[key] ? `<small>+${row.manual[key]} geçmiş veri</small>` : ''}</td>`).join('')}</tr>`).join('');
        const canAddHistory = month < PanelStatistics.monthKey();
        container.innerHTML = `<section class="content-card stats-page">${statisticsControls()}<h3 class="stats-period">${statisticsMonthLabel(month)}</h3><div class="stats-totals">${cards}</div><div class="stats-section-heading"><h3>Kişi Bazında İstatistikler</h3><button type="button" class="login-btn btn-light" onclick="loadStatisticsPage()"><i class="fa-solid fa-rotate"></i> Yenile</button></div><div class="stats-table-scroll"><table class="stats-table"><thead><tr><th scope="col">Personel</th>${PanelStatistics.fields.map(key => `<th scope="col">${statisticsLabels[key]}</th>`).join('')}</tr></thead><tbody>${rowHtml || '<tr><td colspan="5" class="stats-message">Bu ay için kayıt bulunamadı.</td></tr>'}</tbody><tfoot><tr><th scope="row">Toplam</th>${PanelStatistics.fields.map(key => `<td>${data.totals[key].toLocaleString('tr-TR')}</td>`).join('')}</tr></tfoot></table></div><p class="stats-explanation">Checklist: kaydedilen dolu maddeler. Tasarım ve video: Paylaşım Takvimi’nde “Hazırlandı” işaretli içeriklerin adetleri. Paylaşım: “Paylaşıldı” işaretli tüm içeriklerin adetleri. Dönem, takvimdeki görev tarihine göre hesaplanır; hazırlama ve paylaşma işleminin yapıldığı tarihe göre değil.</p>${canAddHistory ? renderStatisticsHistoryForm(month) : '<p class="stats-explanation">Geçmiş veri girmek için önce geçmiş bir ay seçin.</p>'}</section>`;
        const select = document.getElementById('statistics-history-user');
        if (select) select.addEventListener('change', fillStatisticsHistoryForm);
    } catch (error) {
        if (request !== statisticsRequest || activePage !== 'İstatistik') return;
        console.error('İstatistik yükleme hatası:', error);
        container.innerHTML = `<section class="content-card stats-page">${statisticsControls()}<div class="stats-message" role="alert">İstatistikler alınamadı. Bağlantınızı ve veritabanı erişim izinlerini kontrol edin.</div><button type="button" class="login-btn" onclick="loadStatisticsPage()">Tekrar Dene</button></section>`;
    }
}
function renderStatisticsHistoryForm(month) {
    const userIds = new Set(dbUsers.map(u => u.id).filter(Boolean));
    statisticsAdjustments.filter(a => a.month === month).forEach(a => { if (a.userId) userIds.add(a.userId); });
    const options = Array.from(userIds).map(id => {
        const user = dbUsers.find(u => u.id === id);
        const name = user ? `${user.name || 'İsimsiz'} ${user.surname || ''}`.trim() : `Eski kullanıcı (${id})`;
        return `<option value="${statisticsEscape(id)}">${statisticsEscape(name)}</option>`;
    }).join('');
    return `<details class="stats-history"><summary>Geçmiş Ay Verisi Ekle / Düzenle</summary><p>Sistemde kaydı olmayan eski işleri ekleyin. Bu değerler otomatik verilere ilave edilir; takvimde veya checklistte bulunan işleri tekrar girmeyin. Aynı kişi ve ay için yeniden kaydetmek önceki ek değerleri günceller.</p><form id="statistics-history-form" onsubmit="saveStatisticsHistory(event)"><div class="input-group"><label for="statistics-history-user">Personel</label><select id="statistics-history-user" required><option value="">Personel seçin</option>${options}</select></div><div class="stats-history-inputs">${PanelStatistics.fields.map(key => `<div class="input-group"><label for="statistics-history-${key}">${statisticsLabels[key]}</label><input id="statistics-history-${key}" type="number" value="0" min="0" max="1000000" step="1" required></div>`).join('')}</div><div class="input-group"><label for="statistics-history-note">Not (isteğe bağlı)</label><input id="statistics-history-note" type="text" maxlength="500" placeholder="Örn. Eski Excel arşivinden aktarıldı"></div><button type="submit" class="login-btn btn-purple" id="statistics-history-save">${statisticsMonthLabel(month)} Verisini Kaydet</button><div role="status" id="statistics-history-status"></div></form></details>`;
}
function fillStatisticsHistoryForm() {
    const userId = document.getElementById('statistics-history-user').value;
    const existing = statisticsAdjustments.find(a => a.month === statisticsMonth && a.userId === userId);
    PanelStatistics.fields.forEach(key => { document.getElementById(`statistics-history-${key}`).value = existing?.[key] || 0; });
    document.getElementById('statistics-history-note').value = existing?.note || '';
}
async function saveStatisticsHistory(event) {
    event.preventDefault();
    if (!isStatisticsAdmin() || activePage !== 'İstatistik' || statisticsMonth >= PanelStatistics.monthKey()) return;
    const form = document.getElementById('statistics-history-form');
    if (!form.reportValidity()) return;
    const userId = document.getElementById('statistics-history-user').value;
    if (!userId) return;
    const month = statisticsMonth, company = currentCompany;
    const data = { company, month, userId, note: document.getElementById('statistics-history-note').value.trim(), updatedBy: currentUser.id, updatedAt: new Date().toISOString() };
    for (const key of PanelStatistics.fields) {
        const value = Number(document.getElementById(`statistics-history-${key}`).value);
        if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) return;
        data[key] = value;
    }
    const button = document.getElementById('statistics-history-save');
    const status = document.getElementById('statistics-history-status');
    button.disabled = true; status.textContent = 'Kaydediliyor...';
    try {
        const snapshot = await db.collection('users').doc(dbUsers.find(u => u.id === currentUser.id).docId).get();
        if (!snapshot.exists || !statisticsUserIsAdmin(snapshot.data())) throw new Error('Admin yetkisi bulunamadı');
        const docId = [company, month, userId].map(encodeURIComponent).join('__');
        await db.collection('statistics_adjustments').doc(docId).set(data);
        if (activePage === 'İstatistik' && statisticsMonth === month) {
            await loadStatisticsPage();
            const history = document.querySelector('.stats-history');
            if (history) history.open = true;
            const savedStatus = document.getElementById('statistics-history-status');
            if (savedStatus) savedStatus.textContent = 'Geçmiş ay verisi kaydedildi.';
        }
    } catch (error) {
        console.error('Geçmiş veri kayıt hatası:', error);
        status.textContent = 'Kaydedilemedi. Admin yetkinizi, bağlantınızı ve veritabanı izinlerini kontrol edin.';
    } finally { button.disabled = false; }
}
