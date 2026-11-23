/* Tador Leads — front end (vanilla JS, no build) */
(() => {
'use strict';

const API = '/crm/api';
const STATUS = {
  new: 'חדש', no_answer: 'לא ענה', in_progress: 'בטיפול',
  quote_sent: 'נשלחה הצעת מחיר', closed_won: 'נסגרה עסקה', not_relevant: 'לא רלוונטי'
};
const CLOSED = ['closed_won', 'not_relevant'];
const TYPE = { private: 'לקוח פרטי', installer: 'מתקין' };

const S = { user: null, leads: [], reps: [], users: [], quick: '' /* 'late' | 'today' */ };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── API helper ──
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401 && path !== '/auth/login') { showLogin(); }
  if (!res.ok) { const e = new Error(data.error || 'שגיאה'); e.status = res.status; e.data = data; throw e; }
  return data;
}

function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', 2600);
}

// ── Time helpers (all in the browser's local time = Israel) ──
const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDT = d => `${fmtDate(d)} ${fmtTime(d)}`;
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toInputDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "עכשיו" / "לפני 5 דקות" / "לפני 3 שעות" / "אתמול" / "לפני 4 ימים"
function ago(iso) {
  if (!iso) return 'טרם בוצעה שיחה';
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'עכשיו';
  const m = Math.floor(s / 60); if (m < 60) return m === 1 ? 'לפני דקה' : `לפני ${m} דקות`;
  const h = Math.floor(m / 60); if (h < 24) return h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : `לפני ${h} שעות`;
  const d = Math.floor(h / 24); if (d === 1) return 'אתמול';
  if (d === 2) return 'לפני יומיים';
  if (d < 30) return `לפני ${d} ימים`;
  const mo = Math.floor(d / 30); return mo === 1 ? 'לפני חודש' : `לפני ${mo} חודשים`;
}
const daysSince = iso => iso ? (Date.now() - new Date(iso)) / 86400000 : Infinity;

// Follow-up state: 'late' | 'today' | 'future' | ''
// Example: due today 15:00, now 14:00 → 'today'; now 16:00 → 'late'. Date-only due today → 'today' all day.
function fuState(l) {
  if (!l.followUpAt || CLOSED.includes(l.status)) return '';
  const f = new Date(l.followUpAt), now = new Date();
  const today = dayStart(now).getTime(), fday = dayStart(f).getTime();
  if (fday < today) return 'late';
  if (fday === today) return (l.followUpHasTime && f < now) ? 'late' : 'today';
  return 'future';
}
function fuLabel(l) {
  if (!l.followUpAt) return '＋ קבע חזרה';
  const f = new Date(l.followUpAt), st = fuState(l);
  const t = l.followUpHasTime ? ' ' + fmtTime(f) : '';
  if (st === 'late') return `⚠ באיחור · ${fmtDate(f)}${t}`;
  if (st === 'today') return `⏰ היום${t}`;
  const tomorrow = dayStart(new Date()).getTime() + 86400000;
  if (dayStart(f).getTime() === tomorrow) return `מחר${t}`;
  return `📅 ${fmtDate(f)}${t}`;
}

// ── Phone ──
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (d && !d.startsWith('0')) d = '0' + d;
  return /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d) ? d : '';
}
const prettyPhone = p => p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3)}` : `${p.slice(0, 2)}-${p.slice(2)}`;
const intl = p => '972' + p.slice(1);
const waText = l => `היי ${l.name}, פניתי אליך בנוגע להתעניינות שלך ב${l.interest || 'פנייה שלך'}...`;

const ICON = {
  tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.3 5.2 4.6 2.6 1 3.1.8 3.6.8.6-.1 1.8-.7 2-1.5.3-.7.3-1.3.2-1.5-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a9.8 9.8 0 1 1 8.3 4.6zM12 0a12 12 0 0 0-10.3 18L0 24l6.2-1.6A12 12 0 1 0 12 0z"/></svg>'
};

// ══════════════ Auth ══════════════
function showLogin() {
  S.user = null;
  $('#loadingView').classList.add('hidden');
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  setTimeout(() => $('#lgUser').focus(), 50);
}
async function boot() {
  try {
    const { user } = await api('/auth/me');
    if (!user) return showLogin();
    S.user = user; await enterApp();
  } catch (e) { showLogin(); }
}
async function enterApp() {
  $('#loadingView').classList.add('hidden');
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  const isAdmin = S.user.role === 'admin';
  document.body.classList.toggle('is-admin', isAdmin);
  $$('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  $('#newLeadBtn').classList.remove('hidden');   // reps can add their own leads too
  $('#whoName').textContent = S.user.name;
  await loadAll();
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#lgErr').textContent = '';
  try {
    const r = await api('/auth/login', { method: 'POST', body: { username: $('#lgUser').value, password: $('#lgPass').value } });
    S.user = r.user; $('#lgPass').value = ''; await enterApp();
  } catch (err) { $('#lgErr').textContent = err.message; }
});
$('#lgEye').onclick = () => { const p = $('#lgPass'); p.type = p.type === 'password' ? 'text' : 'password'; };
$('#logoutBtn').onclick = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); showLogin(); };
$('#refreshBtn').onclick = async () => { await loadAll(); toast('עודכן'); };

// ══════════════ Data ══════════════
async function loadAll() {
  try {
    const [leads, reps] = await Promise.all([api('/leads'), api('/reps')]);
    S.leads = leads; S.reps = reps;
    fillRepFilter();
    renderLeads();
    if (S.user.role === 'admin' && !$('#tab-users').classList.contains('hidden')) loadUsers();
  } catch (e) { if (e.status !== 401) toast(e.message, true); }
}
function upsertLead(l) {
  const i = S.leads.findIndex(x => x.id === l.id);
  if (i >= 0) S.leads[i] = l; else S.leads.unshift(l);
  renderLeads();
}
function fillRepFilter() {
  const sel = $('#fRep'), cur = sel.value;
  sel.innerHTML = '<option value="">כל אנשי המכירות</option><option value="none">לא משויך</option>' +
    S.reps.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  sel.value = cur;
}

// ══════════════ Filters / sort ══════════════
const F = { q: '', type: '', status: 'open', stale: 0, rep: '', sort: 'follow' };
$('#fSearch').addEventListener('input', e => { F.q = e.target.value.trim().toLowerCase(); renderLeads(); });
$('#fType').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#fType button').forEach(x => x.classList.toggle('on', x === b)); F.type = b.dataset.v; renderLeads();
});
$('#fStatus').onchange = e => { F.status = e.target.value; renderLeads(); };
$('#fStale').onchange = e => { F.stale = +e.target.value; renderLeads(); };
$('#fRep').onchange = e => { F.rep = e.target.value; renderLeads(); };
$('#fSort').onchange = e => { F.sort = e.target.value; renderLeads(); };
$('#moreBtn').onclick = () => { const f = $('.filters'); f.classList.toggle('open'); $('#moreBtn').textContent = f.classList.contains('open') ? 'סינון ומיון ▴' : 'סינון ומיון ▾'; };

function matches(l) {
  if (F.type && l.customerType !== F.type) return false;
  if (F.status === 'open' && CLOSED.includes(l.status)) return false;
  if (F.status && F.status !== 'open' && l.status !== F.status) return false;
  // "not spoken X+ days": counts the last call, or the creation date if never called
  if (F.stale && daysSince(l.lastCallAt || l.createdAt) < F.stale) return false;
  if (F.rep === 'none' && l.assignedTo) return false;
  if (F.rep && F.rep !== 'none' && String(l.assignedTo) !== F.rep) return false;
  if (S.quick && fuState(l) !== S.quick) return false;
  if (F.q) {
    const qd = F.q.replace(/\D/g, '');
    const hay = [l.name, l.interest, ...l.history.map(h => h.text)].join(' ').toLowerCase();
    const phoneHit = qd.length >= 3 && (l.phone.includes(qd) || intl(l.phone).includes(qd));
    if (!hay.includes(F.q) && !phoneHit) return false;
  }
  return true;
}
function sorted(list) {
  const rank = l => ({ late: 0, today: 1 }[fuState(l)] ?? 2);   // overdue, then today, always on top
  const by = {
    follow: (a, b) => (a.followUpAt ? new Date(a.followUpAt) : Infinity) - (b.followUpAt ? new Date(b.followUpAt) : Infinity) || new Date(b.createdAt) - new Date(a.createdAt),
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    stale: (a, b) => daysSince(b.lastCallAt || b.createdAt) - daysSince(a.lastCallAt || a.createdAt)
  }[F.sort];
  return [...list].sort((a, b) => rank(a) - rank(b) || by(a, b));
}

// ══════════════ Render leads ══════════════
function renderStats() {
  const open = S.leads.filter(l => !CLOSED.includes(l.status));
  const late = S.leads.filter(l => fuState(l) === 'late').length;
  const today = S.leads.filter(l => fuState(l) === 'today').length;
  const fresh = S.leads.filter(l => l.status === 'new').length;
  $('#stats').innerHTML =
    `<span class="stat late ${S.quick === 'late' ? 'on' : ''}" data-q="late">⚠ באיחור <b>${late}</b></span>` +
    `<span class="stat today ${S.quick === 'today' ? 'on' : ''}" data-q="today">⏰ לחזור היום <b>${today}</b></span>` +
    `<span class="stat">חדשים <b>${fresh}</b></span>` +
    `<span class="stat">פתוחים <b>${open.length}</b></span>`;
}
$('#stats').addEventListener('click', e => {
  const s = e.target.closest('[data-q]'); if (!s) return;
  S.quick = S.quick === s.dataset.q ? '' : s.dataset.q; renderLeads();
});

function lastNote(l) {
  for (let i = l.history.length - 1; i >= 0; i--) {
    const h = l.history[i];
    if ((h.type === 'call' || h.type === 'note') && h.text) return h;
  }
  return null;
}

// Today's call mark on the check square: 'ok' (answered) | 'na' (no answer, dimmed) | ''
function todayMark(l) {
  for (let i = l.history.length - 1; i >= 0; i--) {
    const h = l.history[i];
    if (h.type !== 'call') continue;
    if (dayStart(new Date(h.at)).getTime() !== dayStart(new Date()).getTime()) return '';
    return h.answered === false ? 'na' : 'ok';
  }
  return '';
}

function leadRow(l) {
  const st = fuState(l), isAdmin = S.user.role === 'admin', mark = todayMark(l);
  const cls = ['lead', st === 'late' ? 'due-late' : st === 'today' ? 'due-today' : '', CLOSED.includes(l.status) ? 'done' : ''].join(' ');
  const ln = lastNote(l);
  const stale = l.lastCallAt && daysSince(l.lastCallAt) >= 7 && !CLOSED.includes(l.status);
  const typeLbl = l.customerType ? TYPE[l.customerType] : 'סוג לקוח?';
  return `<div class="${cls}" data-id="${l.id}">
    <div class="r1">
      <button class="chk ${mark}" data-act="chk" title="סמן שיחה">${mark === 'ok' ? '✓' : mark === 'na' ? '✕' : ''}</button>
      <div class="r1-name">
        <button class="open" data-act="open">${esc(l.name)}</button>
        <button class="tag type ${l.customerType || 'none'}" data-act="type" title="לחץ להחלפה: פרטי / מתקין">${typeLbl}</button>
        ${isAdmin && l.assignedName ? `<span class="tag rep">${esc(l.assignedName)}</span>` : ''}
      </div>
      <label class="st-wrap"><span>סטטוס פנייה</span>
        <select class="st-sel st-${l.status}" data-act="status">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
    </div>
    <div class="choice hidden">
      <button class="ch-ok" data-act="answered">✓ ענה</button>
      <button class="ch-na" data-act="noanswer">✕ לא ענה</button>
    </div>
    <div class="r2"><span class="ltr">${prettyPhone(l.phone)}</span>${l.interest ? ` · <span class="int">${esc(l.interest)}</span>` : ''}</div>
    ${ln ? `<div class="l-note"><b>${esc(ln.byName)}:</b> ${esc(ln.text)}</div>` : ''}
    <div class="r3">
      <span class="last ${l.lastCallAt ? (stale ? 'stale' : '') : 'never'}" title="${l.lastCallAt ? fmtDT(new Date(l.lastCallAt)) : ''}">📞 <b data-ago="${l.lastCallAt || ''}">${ago(l.lastCallAt)}</b>${l.lastCallAt ? ` <small>${fmtDT(new Date(l.lastCallAt))}</small>` : ''}</span>
      <button class="fu-btn ${l.followUpAt ? 'set' : ''} ${st}" data-act="fu">${fuLabel(l)}</button>
      <span class="r3-acts">
        <a class="a-ic tel" href="tel:${l.phone}" title="חיוג">${ICON.tel}</a>
        <button class="a-ic wa" data-act="wa" title="WhatsApp">${ICON.wa}</button>
      </span>
    </div>
  </div>`;
}

function renderLeads() {
  renderStats();
  const list = sorted(S.leads.filter(matches));
  const box = $('#leadList');
  if (!S.leads.length) {
    box.innerHTML = `<div class="empty">אין עדיין לידים.${S.user.role === 'admin' ? '<br/>לחץ "＋ ליד חדש" כדי להוסיף את הראשון.' : ''}</div>`;
    return;
  }
  box.innerHTML = list.length ? list.map(leadRow).join('') : '<div class="empty">אין לידים שמתאימים לסינון</div>';
}

// "לפני X" counters refresh every 30s; due colors re-evaluate every minute
setInterval(() => $$('[data-ago]').forEach(el => { if (el.dataset.ago) el.textContent = ago(el.dataset.ago); }), 30000);
setInterval(() => { if (S.user && $('#modal').classList.contains('hidden')) renderLeads(); }, 60000);

// ── Row actions ──
$('#leadList').addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return;
  const id = el.closest('.lead').dataset.id, l = S.leads.find(x => x.id === id), act = el.dataset.act;
  if (act === 'type') {
    const next = { '': 'private', private: 'installer', installer: '' }[l.customerType || ''];
    return save(id, { customerType: next });
  }
  if (act === 'chk') {   // small square → choose: answered / no answer
    const row = el.closest('.lead'), c = row.querySelector('.choice');
    $$('.choice').forEach(x => x !== c && x.classList.add('hidden'));
    return c.classList.toggle('hidden');
  }
  if (act === 'answered') return logCall(l);
  if (act === 'noanswer') return logNoAnswer(l);
  if (act === 'wa') return openWa(l);
  if (act === 'fu') return openFollowUp(l);
  if (act === 'open') return openLead(l);
});
$('#leadList').addEventListener('change', e => {
  if (e.target.dataset.act !== 'status') return;
  save(e.target.closest('.lead').dataset.id, { status: e.target.value }, 'הסטטוס עודכן');
});

async function save(id, body, msg) {
  try { upsertLead(await api(`/leads/${id}`, { method: 'PUT', body })); if (msg) toast(msg); }
  catch (e) { toast(e.message, true); renderLeads(); }
}

// ══════════════ Modal ══════════════
function modal(html, onOpen) {
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (onOpen) onOpen($('#modalBody'));
}
function closeModal() {
  $('#modal').classList.add('hidden'); document.body.style.overflow = '';
  if (closeModal.after) { const f = closeModal.after; closeModal.after = null; f(); }
}
$('#modalX').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });

// Follow-up quick picks + date/time fields (shared by the call modal and the follow-up modal)
function fuFields(l) {
  const f = l.followUpAt ? new Date(l.followUpAt) : null;
  return `<label>תזכורת לחזרה
    <div class="fu-quick">
      <button type="button" class="chip" data-days="0">היום</button>
      <button type="button" class="chip" data-days="1">מחר</button>
      <button type="button" class="chip" data-days="3">בעוד 3 ימים</button>
      <button type="button" class="chip" data-days="7">בעוד שבוע</button>
      <button type="button" class="chip" data-days="clear">ללא</button>
    </div>
    <div class="row" style="margin-top:6px">
      <input class="inp" type="date" id="fuDate" value="${f ? toInputDate(f) : ''}"/>
      <input class="inp" type="time" id="fuTime" value="${f && l.followUpHasTime ? fmtTime(f) : ''}" placeholder="שעה (לא חובה)"/>
    </div>
    <span class="hint muted">שעה לא חובה. בלי שעה — הליד יודגש כל היום.</span>
  </label>`;
}
function wireFu(root) {
  root.querySelectorAll('[data-days]').forEach(b => b.onclick = () => {
    if (b.dataset.days === 'clear') { root.querySelector('#fuDate').value = ''; root.querySelector('#fuTime').value = ''; return; }
    const d = new Date(); d.setDate(d.getDate() + +b.dataset.days);
    root.querySelector('#fuDate').value = toInputDate(d);
  });
}
function readFu(root) {
  const d = root.querySelector('#fuDate').value, t = root.querySelector('#fuTime').value;
  if (!d) return { followUpAt: null, followUpHasTime: false };
  return { followUpAt: new Date(`${d}T${t || '00:00'}`).toISOString(), followUpHasTime: !!t };
}
const statusSelect = cur => `<select class="inp sel" id="mStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('')}</select>`;

// ── No answer: one tap, no popup ──
async function logNoAnswer(l) {
  try { const r = await api(`/leads/${l.id}/call`, { method: 'POST', body: { answered: false } }); upsertLead(r.lead); toast('נרשם: לא ענה'); }
  catch (e) { toast(e.message, true); }
}

// ── Answered: stamp now, then write notes ──
async function logCall(l) {
  let r;
  try { r = await api(`/leads/${l.id}/call`, { method: 'POST', body: { answered: true } }); }
  catch (e) { return toast(e.message, true); }
  upsertLead(r.lead);
  const now = new Date();
  modal(`<h3>תיעוד שיחה · ${esc(l.name)}</h3>
    <div class="call-stamp">✓ השיחה נרשמה · ${fmtDT(now)}</div>
    <form class="form" id="callForm">
      <label>הערות מהשיחה
        <textarea class="inp" id="mText" placeholder="מה נאמר בשיחה? (נשמר בהיסטוריה עם השם שלך)"></textarea>
      </label>
      <label>סטטוס ${statusSelect(r.lead.status === 'new' ? 'in_progress' : r.lead.status)}</label>
      ${fuFields(r.lead)}
      <div class="foot-btns">
        <button class="btn btn-red" type="submit">שמור</button>
        <button class="btn btn-ghost" type="button" id="mSkip">סגור בלי הערה</button>
      </div>
    </form>`, root => {
    wireFu(root);
    root.querySelector('#mText').focus();
    root.querySelector('#mSkip').onclick = closeModal;
    root.querySelector('#callForm').onsubmit = async e => {
      e.preventDefault();
      try {
        const text = root.querySelector('#mText').value.trim();
        if (text) await api(`/leads/${l.id}/entries/${r.entryId}`, { method: 'PUT', body: { text } });
        upsertLead(await api(`/leads/${l.id}`, { method: 'PUT', body: { status: root.querySelector('#mStatus').value, ...readFu(root) } }));
        closeModal(); toast('השיחה נשמרה');
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ── Follow-up only ──
function openFollowUp(l) {
  modal(`<h3>תזכורת חזרה · ${esc(l.name)}</h3><p class="sub">הליד יקפוץ לראש הרשימה כשיגיע המועד</p>
    <form class="form" id="fuForm">${fuFields(l)}
      <div class="foot-btns"><button class="btn btn-red" type="submit">שמור</button></div></form>`, root => {
    wireFu(root);
    root.querySelector('#fuForm').onsubmit = async e => {
      e.preventDefault(); await save(l.id, readFu(root), 'התזכורת נשמרה'); closeModal();
    };
  });
}

// ── WhatsApp with an editable message ──
function openWa(l) {
  modal(`<h3>WhatsApp · ${esc(l.name)}</h3><p class="sub"><span class="ltr">${prettyPhone(l.phone)}</span> · אפשר לערוך לפני השליחה</p>
    <form class="form" id="waForm">
      <textarea class="inp" id="waText" rows="4">${esc(waText(l))}</textarea>
      <div class="foot-btns"><button class="btn" style="background:var(--wa);color:#fff" type="submit">פתח ב-WhatsApp</button></div>
    </form>`, root => {
    const ta = root.querySelector('#waText'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    root.querySelector('#waForm').onsubmit = e => {
      e.preventDefault();
      window.open(`https://wa.me/${intl(l.phone)}?text=${encodeURIComponent(ta.value)}`, '_blank');
      closeModal();
    };
  });
}

// ── Lead details: history timeline, add note, admin edit ──
function entryHtml(h) {
  const d = new Date(h.at);
  const head = { call: h.answered === false ? '✕ שיחה · לא ענה' : '✓ שיחה · ענה', note: '📝 הערה', status: '↺ שינוי סטטוס', system: '•' }[h.type];
  const text = h.type === 'status' ? `→ ${STATUS[h.text] || h.text}` : h.text;
  return `<div class="tl ${h.type} ${h.type === 'call' && h.answered === false ? 'na' : ''}"><div class="tl-h"><b>${head}</b> · ${esc(h.byName)} · ${fmtDT(d)}</div>${text ? `<div class="tl-t">${esc(text)}</div>` : ''}</div>`;
}
function openLead(l) {
  const isAdmin = S.user.role === 'admin';
  const hist = [...l.history].reverse().map(entryHtml).join('');
  modal(`<h3>${esc(l.name)}</h3>
    <p class="sub"><span class="ltr">${prettyPhone(l.phone)}</span>${l.assignedName ? ' · ' + esc(l.assignedName) : ''}</p>
    ${isAdmin ? `<details class="edit-box"><summary>✎ עריכת פרטי הליד</summary><form class="form" id="editForm">
      <div class="row"><label>שם מלא<input class="inp" id="eName" value="${esc(l.name)}" required/></label>
      <label>טלפון<input class="inp ltr" style="text-align:right" id="ePhone" value="${esc(l.phone)}" inputmode="tel" required/></label></div>
      <label>במה התעניין<textarea class="inp" id="eInt" rows="2">${esc(l.interest)}</textarea></label>
      <label>שיוך לאיש מכירות${repSelect('eRep', l.assignedTo)}</label>
      <div class="foot-btns"><button class="btn btn-dark" type="submit">שמור שינויים</button>
      <button class="btn btn-ghost" type="button" id="eDel" style="color:var(--red)">מחק ליד</button></div>
    </form></details>` : (l.interest ? `<p style="margin-bottom:10px">${esc(l.interest)}</p>` : '')}
    <div class="sec-title">הוסף הערה</div>
    <form class="form" id="noteForm">
      <textarea class="inp" id="nText" rows="2" placeholder="הערה חדשה (לא דורסת הערות קודמות)"></textarea>
      <div class="foot-btns"><button class="btn btn-red" type="submit">הוסף להיסטוריה</button></div>
    </form>
    <div class="sec-title">היסטוריית הליד (${l.history.length})</div>
    <div class="timeline">${hist}</div>`, root => {
    root.querySelector('#noteForm').onsubmit = async e => {
      e.preventDefault();
      const text = root.querySelector('#nText').value.trim(); if (!text) return;
      try { const nl = await api(`/leads/${l.id}/notes`, { method: 'POST', body: { text } }); upsertLead(nl); openLead(nl); toast('ההערה נוספה'); }
      catch (err) { toast(err.message, true); }
    };
    if (!isAdmin) return;
    root.querySelector('#editForm').onsubmit = async e => {
      e.preventDefault();
      try {
        const nl = await api(`/leads/${l.id}`, { method: 'PUT', body: {
          name: root.querySelector('#eName').value, phone: root.querySelector('#ePhone').value,
          interest: root.querySelector('#eInt').value, assignedTo: root.querySelector('#eRep').value } });
        upsertLead(nl); openLead(nl); toast('נשמר');
      } catch (err) { toast(err.message, true); }
    };
    root.querySelector('#eDel').onclick = async () => {
      if (!confirm(`למחוק את הליד "${l.name}" וכל ההיסטוריה שלו?`)) return;
      try { await api(`/leads/${l.id}`, { method: 'DELETE' }); S.leads = S.leads.filter(x => x.id !== l.id); renderLeads(); closeModal(); toast('הליד נמחק'); }
      catch (err) { toast(err.message, true); }
    };
  });
}

function repSelect(id, cur) {
  const def = !cur && S.reps.length === 1 ? S.reps[0].id : cur;   // default: the only active rep
  return `<select class="inp sel" id="${id}"><option value="">— לא משויך —</option>${S.reps.map(r =>
    `<option value="${r.id}" ${String(r.id) === String(def) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
}

// ── New lead (admin) with live phone validation + duplicate alert ──
$('#newLeadBtn').onclick = () => {
  modal(`<h3>ליד חדש</h3><p class="sub">שם וטלפון הם חובה</p>
    <form class="form" id="nlForm" autocomplete="off">
      <label>שם מלא *<input class="inp" id="nlName" required/></label>
      <label>מספר טלפון *<input class="inp" id="nlPhone" inputmode="tel" placeholder="050-1234567" required/>
        <span class="hint" id="nlPhoneMsg"></span></label>
      <label>במה התעניין<textarea class="inp" id="nlInt" rows="3" placeholder="למשל: אינטרקום לבניין 12 דירות"></textarea></label>
      ${S.user.role === 'admin' ? `<label>שיוך לאיש מכירות${repSelect('nlRep', '')}</label>` : '<p class="hint muted">הליד ישויך אליך</p>'}
      <div class="foot-btns"><button class="btn btn-red" type="submit" id="nlSave">שמור ליד</button></div>
    </form>`, root => {
    const ph = root.querySelector('#nlPhone'), msg = root.querySelector('#nlPhoneMsg');
    let timer, dup = null;
    root.querySelector('#nlName').focus();
    ph.addEventListener('input', () => {
      clearTimeout(timer); dup = null; msg.className = 'hint'; msg.innerHTML = '';
      const p = normPhone(ph.value);
      if (!ph.value.trim()) return;
      if (!p) { if (ph.value.replace(/\D/g, '').length >= 9) { msg.className = 'hint err'; msg.textContent = 'מספר לא תקין'; } return; }
      timer = setTimeout(async () => {
        try {
          const r = await api('/leads/check-phone?phone=' + encodeURIComponent(p));
          if (r.exists) {
            dup = r.exists; msg.className = 'hint err';
            const mine = S.leads.some(x => x.id === String(r.exists.id));
            msg.innerHTML = `⚠ המספר כבר קיים במערכת: <b>${esc(r.exists.name)}</b>` + (mine ? ' · <a href="#" id="nlOpenDup">פתח ליד</a>' : '');
            const a = root.querySelector('#nlOpenDup');
            if (a) a.onclick = ev => { ev.preventDefault(); const l = S.leads.find(x => x.id === String(r.exists.id)); if (l) openLead(l); };
          } else { msg.className = 'hint ok'; msg.textContent = '✓ ' + prettyPhone(p); }
        } catch (_) {}
      }, 300);
    });
    root.querySelector('#nlForm').onsubmit = async e => {
      e.preventDefault();
      if (!normPhone(ph.value)) { msg.className = 'hint err'; msg.textContent = 'מספר טלפון לא תקין'; ph.focus(); return; }
      if (dup) { toast('המספר כבר קיים במערכת', true); return; }
      try {
        const l = await api('/leads', { method: 'POST', body: {
          name: root.querySelector('#nlName').value, phone: ph.value,
          interest: root.querySelector('#nlInt').value, assignedTo: (root.querySelector('#nlRep') || {}).value || '' } });
        upsertLead(l); closeModal(); toast('הליד נוסף');
      } catch (err) { toast(err.message, true); }
    };
  });
};

// ══════════════ Tabs ══════════════
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  $$('.tab').forEach(x => x.classList.toggle('active', x === b));
  $('#tab-leads').classList.toggle('hidden', b.dataset.tab !== 'leads');
  $('#tab-users').classList.toggle('hidden', b.dataset.tab !== 'users');
  if (b.dataset.tab === 'users') loadUsers();
});

// ══════════════ Users (admin) ══════════════
async function loadUsers() {
  try { S.users = await api('/users'); renderUsers(); } catch (e) { toast(e.message, true); }
}
function renderUsers() {
  const box = $('#userList');
  if (!S.users.length) { box.innerHTML = '<div class="empty">אין עדיין אנשי מכירות. הוסף את הראשון.</div>'; return; }
  box.innerHTML = S.users.map(u => `<div class="user ${u.isActive ? '' : 'off'}" data-id="${u.id}">
    <div class="u-main"><div class="u-name">${esc(u.fullName)}</div>
      <div class="muted" style="font-size:12.5px"><span class="ltr">${esc(u.username)}</span> · ${u.leads} לידים · ${u.lastLogin ? 'כניסה אחרונה ' + ago(u.lastLogin) : 'טרם נכנס'}</div></div>
    <label class="switch"><input type="checkbox" data-f="seeAll" ${u.seeAll ? 'checked' : ''}/> רואה את כל הלידים</label>
    <label class="switch"><input type="checkbox" data-f="isActive" ${u.isActive ? 'checked' : ''}/> פעיל</label>
    <button class="btn btn-ghost" data-act="creds">🔑 פרטי כניסה</button>
    <button class="btn btn-ghost" data-act="edit">עריכה</button>
  </div>`).join('');
}
$('#userList').addEventListener('change', async e => {
  const f = e.target.dataset.f; if (!f) return;
  const id = e.target.closest('.user').dataset.id;
  try { await api(`/users/${id}`, { method: 'PUT', body: { [f]: e.target.checked } }); toast('עודכן'); await loadUsers(); S.reps = await api('/reps'); fillRepFilter(); }
  catch (err) { toast(err.message, true); }
});
$('#userList').addEventListener('click', e => {
  const act = e.target.dataset.act; if (!act) return;
  const u = S.users.find(x => x.id === e.target.closest('.user').dataset.id);
  if (act === 'edit') return userModal(u);
  if (act === 'creds') return resendCreds(u);
});
$('#newUserBtn').onclick = () => userModal(null);

function userModal(u) {
  modal(`<h3>${u ? 'עריכת איש מכירות' : 'איש מכירות חדש'}</h3>
    <form class="form" id="uForm" autocomplete="off">
      <label>שם מלא *<input class="inp" id="uName" value="${esc(u ? u.fullName : '')}" required/></label>
      <label>שם משתמש (אנגלית) *<input class="inp ltr" style="text-align:right" id="uUser" value="${esc(u ? u.username : '')}" ${u ? 'disabled' : 'required'} autocapitalize="off"/></label>
      <label>${u ? 'סיסמה חדשה (ריק = ללא שינוי)' : 'סיסמה * (לפחות 6 תווים)'}<input class="inp ltr" style="text-align:right" id="uPass" type="text" value="${u ? '' : genPass()}" ${u ? '' : 'required'} autocomplete="new-password"/></label>
      <label class="switch"><input type="checkbox" id="uAll" ${u && u.seeAll ? 'checked' : ''}/> רואה את כל הלידים (לא רק המשויכים אליו)</label>
      <div class="foot-btns"><button class="btn btn-red" type="submit">שמור</button></div>
      <div class="err" id="uErr"></div>
    </form>`, root => {
    root.querySelector('#uForm').onsubmit = async e => {
      e.preventDefault();
      const body = { fullName: root.querySelector('#uName').value, seeAll: root.querySelector('#uAll').checked };
      const pw = root.querySelector('#uPass').value; if (pw) body.password = pw;
      try {
        const username = u ? u.username : root.querySelector('#uUser').value.trim().toLowerCase();
        if (u) await api(`/users/${u.id}`, { method: 'PUT', body });
        else await api('/users', { method: 'POST', body: { ...body, username, password: pw } });
        await loadUsers(); S.reps = await api('/reps'); fillRepFilter();
        if (pw) credsModal(body.fullName.trim(), username, pw); else { closeModal(); toast('נשמר'); }
      } catch (err) { root.querySelector('#uErr').textContent = err.message; }
    };
  });
}

// ══════════════ Login details to send to a rep ══════════════
// Example: "היי דנה 👋 ... 🔗 https://installers.co.il/crm  👤 dana  🔑 Kx7m-42pq"
function genPass() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(8));
  const s = [...r].map(n => a[n % a.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
function credsText(name, username, password) {
  const first = String(name).split(' ')[0];
  return `היי ${first} 👋\nאלה פרטי הכניסה שלך למערכת הלידים של Tador:\n\n` +
    `🔗 כתובת: ${location.origin}/crm\n👤 שם משתמש: ${username}\n🔑 סיסמה: ${password}\n\n` +
    `טיפ: אחרי הכניסה לחץ על 📲 "הוסף למסך הבית" — ככה המערכת תיפתח כמו אפליקציה.`;
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (_) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false;
    try { ok = document.execCommand('copy'); } catch (__) {}
    ta.remove(); return ok;
  }
}
function credsModal(name, username, password) {
  const text = credsText(name, username, password);
  modal(`<h3>פרטי כניסה · ${esc(name)}</h3>
    <p class="sub">העתק ושלח לאיש המכירות. הסיסמה מוצגת רק עכשיו — אחר כך היא נשמרת מוצפנת.</p>
    <div class="form">
      <textarea class="inp" id="cText" rows="8" readonly>${esc(text)}</textarea>
      <div class="foot-btns">
        <button class="btn btn-red" type="button" id="cCopy">📋 העתק הודעה</button>
        <button class="btn" style="background:var(--wa);color:#fff" type="button" id="cWa">שלח ב-WhatsApp</button>
      </div>
    </div>`, root => {
    root.querySelector('#cCopy').onclick = async () => toast(await copyText(text) ? 'ההודעה הועתקה — הדבק ושלח' : 'לא הצליח להעתיק — סמן והעתק ידנית', false);
    root.querySelector('#cWa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  });
}
async function resendCreds(u) {
  if (!confirm(`הסיסמה של ${u.fullName} שמורה מוצפנת ואי אפשר להציג אותה.\nליצור סיסמה חדשה ולהכין הודעה לשליחה?\n(הסיסמה הקודמת תפסיק לעבוד)`)) return;
  const pw = genPass();
  try { await api(`/users/${u.id}`, { method: 'PUT', body: { password: pw } }); credsModal(u.fullName, u.username, pw); }
  catch (e) { toast(e.message, true); }
}

window.TadorLeads = { toast, modal, closeModal };
boot();
})();
