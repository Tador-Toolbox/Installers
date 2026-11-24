// ─── Sales CRM API — mounted at /crm/api ─────────────────────────────────────
// Self-contained: own models (lib/crm-models.js), own session key (req.session.crm).
// Admin logs in with the existing site Admin account; sales reps are CrmUser docs.
const express = require('express');
const { Admin } = require('../db');
const { CrmUser, CrmLead, STATUSES, normalizePhone } = require('../lib/crm-models');

const router = express.Router();
// '' is allowed (no email). Example: ' Dana@Mail.co.il ' → 'dana@mail.co.il'; 'dana@' → null (invalid)
// Enquiry date from the form: a valid date, not in the future. Example: '2026-11-20T00:00' → Date; '' → null
function cleanDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d) || d.getTime() > Date.now() + 36 * 3600 * 1000) return undefined;
  return d;
}
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!e) return '';
  return /^[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}$/.test(e) ? e : null;
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Debug log (in memory, last 200 events) — read-only at GET /crm/api/debug (admin) ──
const debugLog = [];
function log(event, data = {}) {
  debugLog.unshift({ at: new Date().toISOString(), event, ...data });
  if (debugLog.length > 200) debugLog.pop();
}

// ── Login brute-force guard: 8 failures per IP+username → 15 min lock ──
const fails = new Map();
const LOCK_MS = 15 * 60 * 1000, MAX_FAILS = 8;
function lockKey(req, u) { return (req.ip || '') + '|' + String(u || '').toLowerCase(); }
function isLocked(k) {
  const f = fails.get(k);
  if (!f) return false;
  if (Date.now() - f.first > LOCK_MS) { fails.delete(k); return false; }
  return f.count >= MAX_FAILS;
}
function addFail(k) {
  const f = fails.get(k);
  if (!f || Date.now() - f.first > LOCK_MS) fails.set(k, { count: 1, first: Date.now() });
  else f.count++;
}

// ── Guards ──
function me(req) { return req.session && req.session.crm; }
function requireUser(req, res, next) {
  if (me(req)) return next();
  res.status(401).json({ error: 'יש להתחבר מחדש' });
}
function requireAdmin(req, res, next) {
  if (me(req) && me(req).role === 'admin') return next();
  res.status(403).json({ error: 'אין הרשאה' });
}

// Can this user see / work on this lead?
async function canAccess(req, lead) {
  const u = me(req);
  if (u.role === 'admin') return true;
  const rep = await CrmUser.findById(u.id);
  if (!rep || !rep.isActive) return false;
  if (rep.seeAll) return true;
  return String(lead.assignedTo || '') === String(u.id);
}

function toClient(l, repNames) {
  return {
    id: l._id, name: l.name, phone: l.phone, interest: l.interest, email: l.email || '', inquiryAt: l.inquiryAt || l.createdAt,
    assignedTo: l.assignedTo, assignedName: repNames[String(l.assignedTo)] || '',
    customerType: l.customerType, status: l.status,
    lastCallAt: l.lastCallAt, followUpAt: l.followUpAt, followUpHasTime: l.followUpHasTime,
    history: (l.history || []).map(h => ({ id: h._id, type: h.type, text: h.text, at: h.at, byId: h.byId, byName: h.byName, answered: h.answered !== false })),
    createdAt: l.createdAt, createdByName: l.createdByName
  };
}
async function repNameMap() {
  const reps = await CrmUser.find({}, 'fullName');
  return Object.fromEntries(reps.map(r => [String(r._id), r.fullName]));
}

// ═══ Auth ═══════════════════════════════════════════════════════════════════
router.post('/auth/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const k = lockKey(req, username);
  if (isLocked(k)) { log('login_locked', { username }); return res.status(429).json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד 15 דקות' }); }

  const rep = await CrmUser.findOne({ username: username.toLowerCase() });
  if (rep && rep.isActive && await rep.comparePassword(password)) {
    req.session.crm = { role: 'sales', id: String(rep._id), name: rep.fullName };
    rep.lastLogin = new Date(); await rep.save();
    fails.delete(k); log('login_ok', { username, role: 'sales' });
    return res.json({ ok: true, user: req.session.crm });
  }
  const admin = await Admin.findOne({ username });
  if (admin && await admin.comparePassword(password)) {
    req.session.crm = { role: 'admin', id: 'admin:' + admin._id, name: 'מנהל' };
    fails.delete(k); log('login_ok', { username, role: 'admin' });
    return res.json({ ok: true, user: req.session.crm });
  }
  addFail(k); log('login_fail', { username, disabled: !!(rep && !rep.isActive) });
  res.status(401).json({ error: rep && !rep.isActive ? 'המשתמש מושבת' : 'שם משתמש או סיסמה שגויים' });
}));

router.post('/auth/logout', (req, res) => {
  delete req.session.crm;   // only the CRM login — the /admin session stays
  res.json({ ok: true });
});

router.get('/auth/me', wrap(async (req, res) => {
  const u = me(req);
  if (!u) return res.json({ user: null });
  if (u.role === 'sales') {   // a disabled rep is logged out on next check
    const rep = await CrmUser.findById(u.id);
    if (!rep || !rep.isActive) { delete req.session.crm; return res.json({ user: null }); }
    u.name = rep.fullName; u.seeAll = rep.seeAll;
  }
  res.json({ user: u });
}));

// ═══ Users (admin) ══════════════════════════════════════════════════════════
router.get('/users', requireAdmin, wrap(async (req, res) => {
  const users = await CrmUser.find({}, '-password').sort({ createdAt: 1 });
  const counts = await CrmLead.aggregate([{ $group: { _id: '$assignedTo', n: { $sum: 1 } } }]);
  const cm = Object.fromEntries(counts.map(c => [String(c._id), c.n]));
  res.json(users.map(u => ({ id: u._id, username: u.username, fullName: u.fullName, seeAll: u.seeAll,
    isActive: u.isActive, lastLogin: u.lastLogin, leads: cm[String(u._id)] || 0 })));
}));

router.post('/users', requireAdmin, wrap(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const fullName = String(req.body.fullName || '').trim();
  const password = String(req.body.password || '');
  if (!username || !fullName) return res.status(400).json({ error: 'שם משתמש ושם מלא הם חובה' });
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return res.status(400).json({ error: 'שם משתמש: 3-30 תווים, אותיות באנגלית/ספרות' });
  if (password.length < 6) return res.status(400).json({ error: 'סיסמה: לפחות 6 תווים' });
  if (await CrmUser.findOne({ username })) return res.status(409).json({ error: 'שם המשתמש כבר קיים' });
  const u = await CrmUser.create({ username, fullName, password, seeAll: !!req.body.seeAll });
  log('user_created', { username });
  res.json({ ok: true, id: u._id });
}));

router.put('/users/:id', requireAdmin, wrap(async (req, res) => {
  const u = await CrmUser.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'משתמש לא נמצא' });
  if (req.body.fullName !== undefined) {
    const n = String(req.body.fullName).trim();
    if (!n) return res.status(400).json({ error: 'שם מלא הוא חובה' });
    u.fullName = n;
  }
  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'סיסמה: לפחות 6 תווים' });
    u.password = String(req.body.password);
  }
  if (req.body.isActive !== undefined) u.isActive = !!req.body.isActive;
  if (req.body.seeAll !== undefined) u.seeAll = !!req.body.seeAll;
  await u.save();
  log('user_updated', { username: u.username, isActive: u.isActive, seeAll: u.seeAll });
  res.json({ ok: true });
}));

// Active reps — for the "assign to" dropdown
router.get('/reps', requireUser, wrap(async (req, res) => {
  const reps = await CrmUser.find({ isActive: true }, 'fullName').sort({ createdAt: 1 });
  res.json(reps.map(r => ({ id: r._id, name: r.fullName })));
}));

// ═══ Leads ══════════════════════════════════════════════════════════════════
router.get('/leads', requireUser, wrap(async (req, res) => {
  const u = me(req);
  let q = {};
  if (u.role === 'sales') {
    const rep = await CrmUser.findById(u.id);
    if (!rep || !rep.isActive) return res.status(401).json({ error: 'יש להתחבר מחדש' });
    if (!rep.seeAll) q = { assignedTo: rep._id };
  }
  const [leads, names] = await Promise.all([CrmLead.find(q).sort({ createdAt: -1 }), repNameMap()]);
  res.json(leads.map(l => toClient(l, names)));
}));

// Live phone check while typing: valid? already exists?
router.get('/leads/check-phone', requireUser, wrap(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return res.json({ valid: false });
  const ex = await CrmLead.findOne({ phone }, 'name');
  res.json({ valid: true, phone, exists: ex ? { id: ex._id, name: ex.name } : null });
}));

router.post('/leads', requireUser, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = normalizePhone(req.body.phone);
  if (!name) return res.status(400).json({ error: 'שם מלא הוא חובה' });
  if (!phone) return res.status(400).json({ error: 'מספר טלפון לא תקין' });
  const email = cleanEmail(req.body.email);
  if (email === null) return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
  const inquiryAt = cleanDate(req.body.inquiryAt);
  if (inquiryAt === undefined) return res.status(400).json({ error: 'תאריך פנייה לא תקין' });
  const ex = await CrmLead.findOne({ phone }, 'name');
  if (ex) return res.status(409).json({ error: `המספר כבר קיים במערכת (${ex.name})`, existingId: ex._id });
  let assignedTo = req.body.assignedTo || null;
  if (me(req).role === 'sales') assignedTo = me(req).id;   // a rep's own lead is always his
  else if (!assignedTo) {   // default: the only active rep
    const reps = await CrmUser.find({ isActive: true }, '_id');
    if (reps.length === 1) assignedTo = reps[0]._id;
  }
  const lead = await CrmLead.create({
    name, phone, email, inquiryAt: inquiryAt || new Date(), interest: String(req.body.interest || '').trim(), assignedTo,
    status: STATUSES.includes(req.body.status) ? req.body.status : 'new',
    createdByName: me(req).name,
    history: [{ type: 'system', text: 'הליד נוצר', byId: me(req).id, byName: me(req).name }]
  });
  log('lead_created', { phone, assignedTo: String(assignedTo || '') });
  res.json(toClient(lead, await repNameMap()));
}));

// Update: admin edits everything; a rep edits type / status / follow-up only
router.put('/leads/:id', requireUser, wrap(async (req, res) => {
  const lead = await CrmLead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  if (!(await canAccess(req, lead))) return res.status(403).json({ error: 'אין הרשאה לליד הזה' });
  const u = me(req), b = req.body;

  if (u.role === 'admin') {
    if (b.name !== undefined) {
      if (!String(b.name).trim()) return res.status(400).json({ error: 'שם מלא הוא חובה' });
      lead.name = String(b.name).trim();
    }
    if (b.phone !== undefined) {
      const p = normalizePhone(b.phone);
      if (!p) return res.status(400).json({ error: 'מספר טלפון לא תקין' });
      if (p !== lead.phone) {
        const ex = await CrmLead.findOne({ phone: p }, 'name');
        if (ex) return res.status(409).json({ error: `המספר כבר קיים במערכת (${ex.name})` });
        lead.phone = p;
      }
    }
    if (b.interest !== undefined) lead.interest = String(b.interest).trim();
    if (b.assignedTo !== undefined) lead.assignedTo = b.assignedTo || null;
  }
  if (b.inquiryAt !== undefined) {
    const d = cleanDate(b.inquiryAt);
    if (!d) return res.status(400).json({ error: 'תאריך פנייה לא תקין' });
    lead.inquiryAt = d;
  }
  if (b.email !== undefined) {
    const e = cleanEmail(b.email);
    if (e === null) return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
    lead.email = e;
  }
  if (b.customerType !== undefined) {
    if (!['', 'private', 'installer'].includes(b.customerType)) return res.status(400).json({ error: 'סוג לקוח לא תקין' });
    lead.customerType = b.customerType;
  }
  if (b.status !== undefined && b.status !== lead.status) {
    if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'סטטוס לא תקין' });
    lead.history.push({ type: 'status', text: b.status, byId: u.id, byName: u.name });
    lead.status = b.status;
  }
  if (b.followUpAt !== undefined) {
    lead.followUpAt = b.followUpAt ? new Date(b.followUpAt) : null;
    lead.followUpHasTime = !!(b.followUpAt && b.followUpHasTime);
    if (lead.followUpAt && isNaN(lead.followUpAt)) return res.status(400).json({ error: 'תאריך לא תקין' });
  }
  lead.updatedAt = new Date();
  await lead.save();
  log('lead_updated', { id: String(lead._id), by: u.name, fields: Object.keys(b) });
  res.json(toClient(lead, await repNameMap()));
}));

// "צלצלתי" — stamps now as the last call and opens a call entry to write notes into
router.post('/leads/:id/call', requireUser, wrap(async (req, res) => {
  const lead = await CrmLead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  if (!(await canAccess(req, lead))) return res.status(403).json({ error: 'אין הרשאה לליד הזה' });
  const u = me(req), now = new Date();
  const answered = req.body.answered !== false;
  lead.lastCallAt = now;
  lead.history.push({ type: 'call', text: String(req.body.text || '').trim(), at: now, byId: u.id, byName: u.name, answered });
  // no answer → status "לא ענה" (only from an early stage, never overrides a quote / closed deal)
  if (!answered && ['new', 'in_progress', 'no_answer'].includes(lead.status) && lead.status !== 'no_answer') {
    lead.history.push({ type: 'status', text: 'no_answer', at: now, byId: u.id, byName: u.name });
    lead.status = 'no_answer';
  }
  lead.updatedAt = now;
  await lead.save();
  const entry = lead.history[lead.history.length - 1];
  log('call_logged', { id: String(lead._id), by: u.name, answered });
  res.json({ lead: toClient(lead, await repNameMap()), entryId: entry._id });
}));

// Add a standalone note
router.post('/leads/:id/notes', requireUser, wrap(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'ההערה ריקה' });
  const lead = await CrmLead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  if (!(await canAccess(req, lead))) return res.status(403).json({ error: 'אין הרשאה לליד הזה' });
  const u = me(req);
  lead.history.push({ type: 'note', text, byId: u.id, byName: u.name });
  lead.updatedAt = new Date();
  await lead.save();
  res.json(toClient(lead, await repNameMap()));
}));

// Fill in the text of a call entry you just logged (only the writer, within 24h)
router.put('/leads/:id/entries/:eid', requireUser, wrap(async (req, res) => {
  const lead = await CrmLead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'ליד לא נמצא' });
  if (!(await canAccess(req, lead))) return res.status(403).json({ error: 'אין הרשאה לליד הזה' });
  const e = lead.history.id(req.params.eid);
  if (!e || !['call', 'note'].includes(e.type)) return res.status(404).json({ error: 'רשומה לא נמצאה' });
  if (e.byId !== me(req).id || Date.now() - e.at > 24 * 3600 * 1000) return res.status(403).json({ error: 'אפשר לערוך רק רשומה שלך מ-24 השעות האחרונות' });
  e.text = String(req.body.text || '').trim();
  await lead.save();
  res.json(toClient(lead, await repNameMap()));
}));

router.delete('/leads/:id', requireAdmin, wrap(async (req, res) => {
  const lead = await CrmLead.findByIdAndDelete(req.params.id);
  log('lead_deleted', { id: req.params.id, phone: lead && lead.phone });
  res.json({ ok: true });
}));

// ═══ Debug (admin, read-only) ═══════════════════════════════════════════════
router.get('/debug', requireAdmin, (req, res) => res.json({ count: debugLog.length, log: debugLog }));

// JSON errors (never an HTML error page for the app)
router.use((err, req, res, next) => {
  log('error', { path: req.path, message: err.message });
  res.status(500).json({ error: 'שגיאת שרת: ' + err.message });
});

module.exports = router;
