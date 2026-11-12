// Hebrew version of the English designer landing pages (/d/:slug?lang=he)
// - HE: fixed template texts, keyed by the English string
// - localizeDesigner(): overlays the designer's Hebrew content (designer.he) on the English content,
//   field by field — anything not translated falls back to English.

const HE = {
  'Interior Design': 'עיצוב פנים',
  'Award-winning interior designer – contact us for a free consultation': 'עיצוב פנים ברמה הגבוהה ביותר – צרו קשר לייעוץ ראשוני ללא עלות',
  'Portfolio': 'תיק עבודות',
  'About': 'אודות',
  'Services': 'שירותים',
  'Contact': 'צור קשר',
  'Free Consultation': 'ייעוץ חינם',
  'Interior Design Studio': 'סטודיו לעיצוב פנים',
  'Transforming spaces into extraordinary living experiences': 'הופכים חללים לחוויית מגורים יוצאת דופן',
  'Call Now': 'התקשרו עכשיו',
  'Get a Free Quote': 'לקבלת הצעת מחיר',
  'Years of Experience': 'שנות ניסיון',
  'Projects Completed': 'פרויקטים שהושלמו',
  'Portfolio Works': 'עבודות בתיק',
  'Client Reviews': 'המלצות לקוחות',
  'Selected Work': 'עבודות נבחרות',
  'Every project tells a unique story': 'כל פרויקט מספר סיפור ייחודי',
  'About Me': 'קצת עליי',
  'An interior designer with a passion for creating spaces that reflect the personality and lifestyle of each client. I believe every home has the potential to become a dream space — with the right vision and design approach.':
    'מעצבת פנים עם תשוקה ליצירת חללים שמשקפים את האישיות ואורח החיים של כל לקוח. אני מאמינה שלכל בית יש פוטנציאל להפוך לבית החלומות — עם החזון והגישה העיצובית הנכונים.',
  'What I Offer': 'מה אני מציעה',
  'Design Services': 'שירותי עיצוב',
  'Client Feedback': 'לקוחות מספרים',
  'What Clients Say': 'מה הלקוחות אומרים',
  'Get in Touch': 'דברו איתי',
  "Let's talk about your space": 'בואו נדבר על החלל שלכם',
  "Free initial consultation. I'd love to hear about your project and offer the perfect design solution.":
    'ייעוץ ראשוני ללא עלות. אשמח לשמוע על הפרויקט שלכם ולהציע את הפתרון העיצובי המושלם.',
  "Leave your details and we'll get back to you": 'השאירו פרטים ונחזור אליכם',
  'Full Name *': 'שם מלא *',
  'Jane Smith': 'ישראל ישראלי',
  'Phone *': 'טלפון *',
  '+1 555 000 0000': '050-0000000',
  'Project Type': 'סוג הפרויקט',
  'Select project type': 'בחרו סוג פרויקט',
  'Full Interior Design': 'עיצוב פנים מלא',
  'Design Consultation': 'ייעוץ עיצובי',
  'Other': 'אחר',
  'Message': 'הודעה',
  'Tell me about your space — size, location, what matters most to you...': 'ספרו לי על החלל — גודל, מיקום, מה הכי חשוב לכם...',
  'Send Details': 'שליחה',
  "Thank you! We'll be in touch shortly.": 'תודה! נחזור אליכם בהקדם.',
  'Proudly built by': 'פותח בגאווה על ידי',
  'Want to transform your space?': 'רוצים לשדרג את החלל שלכם?',
  'Leave your details for a free initial consultation!': 'השאירו פרטים לייעוץ ראשוני ללא עלות!',
  'Sending...': 'שולח...'
};

function makeT(lang) {
  return function T(s) { return lang === 'he' && HE[s] ? HE[s] : s; };
}

const str = v => (typeof v === 'string' && v.trim()) ? v.trim() : '';
const crypto = require('crypto');
const https  = require('https');

// ─── Automatic translation (English → Hebrew) ────────────────────────────────
// Texts the designer wrote in English are machine-translated the first time the Hebrew page is opened,
// and the result is cached on the designer (heAuto: { md5(english): hebrew }), so each text is translated once.
// Priority on the Hebrew page: text typed in the admin "עב" editor  >  automatic translation  >  English.

const keyOf     = s => crypto.createHash('md5').update(s).digest('hex');
const hasHebrew = s => /[֐-׿]/.test(s);
const needsAuto = s => !!str(s) && !hasHebrew(s) && /[A-Za-z]/.test(s) && !HE[str(s)];

// In-memory log, readable at /api/admin/translate-debug
const debugLog = [];
function logT(entry) { debugLog.push({ at: new Date().toISOString(), ...entry }); if (debugLog.length > 150) debugLog.shift(); }

function httpTranslate(text) {
  return new Promise((resolve, reject) => {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=he&dt=t&q=' + encodeURIComponent(text);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + body.slice(0, 120)));
        try {
          const data = JSON.parse(body);
          const out = (data[0] || []).map(seg => (seg && seg[0]) || '').join('').trim();
          if (!out) return reject(new Error('empty translation: ' + body.slice(0, 120)));
          resolve(out);
        } catch (e) { reject(new Error('bad response: ' + body.slice(0, 120))); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
let transport = httpTranslate;               // replaceable in tests
function _setTransport(fn) { transport = fn; }

// Long texts are sent in pieces (by line, then by sentence) so the request never gets too long.
async function translateText(text) {
  const pieces = [];
  text.split('\n').forEach((line, i) => {
    if (i) pieces.push('\n');
    if (line.length <= 900) return pieces.push(line);
    let cur = '';
    line.split(/(?<=[.!?])\s+/).forEach(sentence => {
      if (cur && (cur + ' ' + sentence).length > 900) { pieces.push(cur); cur = sentence; }
      else cur = cur ? cur + ' ' + sentence : sentence;
    });
    if (cur) pieces.push(cur);
  });
  let out = '';
  for (const p of pieces) out += (p === '\n' || !p.trim()) ? p : (out && !out.endsWith('\n') ? ' ' : '') + await transport(p);
  return out.trim();
}

// Every English text on the page that should have an automatic Hebrew version.
function autoStrings(d) {
  const list = [];
  const add = s => { if (needsAuto(s)) list.push(str(s)); };
  ['badge', 'tagline', 'about'].forEach(k => add(d[k]));
  (d.services || []).forEach(svc => { const p = String(svc).split('|'); if (p.length > 1) { add(p[1]); add(p[2]); } else add(svc); });
  ['specialties', 'areas', 'trustItems'].forEach(k => (d[k] || []).forEach(add));
  (d.testimonials || []).forEach(t => add(t.text));
  if (d.popup) ['title', 'text', 'btnText'].forEach(k => add(d.popup[k]));
  return [...new Set(list)];
}

const lastFail = new Map();   // designer id -> time of last failed attempt (don't retry on every page view)

// Makes sure d.heAuto holds a translation for every English text. Returns the (possibly updated) map.
// Never throws: on any failure the page simply shows English for the texts that are still missing.
async function ensureAutoTranslations(d, save) {
  const cache = (d.heAuto && typeof d.heAuto === 'object') ? d.heAuto : {};
  const wanted = autoStrings(d);
  const missing = wanted.filter(s => !cache[keyOf(s)]);
  const id = String(d._id || d.slug);
  if (!missing.length) return cache;
  if (Date.now() - (lastFail.get(id) || 0) < 60 * 1000) return cache;

  const fresh = {};
  let failed = 0, firstError = '';
  const queue = missing.slice();
  const deadline = Date.now() + 9000;
  async function worker() {
    while (queue.length && Date.now() < deadline) {
      const s = queue.shift();
      try { fresh[keyOf(s)] = await translateText(s); }
      catch (e) { failed++; if (!firstError) firstError = e.message; }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  failed += queue.length;

  // keep only translations of texts that still exist on the page
  const next = {};
  wanted.forEach(s => { const k = keyOf(s); if (fresh[k] || cache[k]) next[k] = fresh[k] || cache[k]; });
  if (failed) lastFail.set(id, Date.now()); else lastFail.delete(id);
  logT({ slug: d.slug, wanted: wanted.length, missing: missing.length, translated: Object.keys(fresh).length, failed, error: firstError,
         sample: missing[0] ? { en: missing[0].slice(0, 80), he: (fresh[keyOf(missing[0])] || '').slice(0, 80) } : null });
  if (Object.keys(fresh).length && save) {
    try { await save(next); } catch (e) { logT({ slug: d.slug, saveError: e.message }); }
  }
  return next;
}

// Returns a copy of the designer with Hebrew content swapped in wherever it exists.
function localizeDesigner(d, lang, autoMap) {
  if (lang !== 'he') return d;
  const he = d.he || {};
  const auto = autoMap || d.heAuto || {};
  const tr = s => { const v = str(s); return !v ? s : (HE[v] || auto[keyOf(v)] || s); };   // stock phrase > auto > English
  const out = { ...d };

  ['name', 'businessName'].forEach(k => { if (str(he[k])) out[k] = str(he[k]); });       // names are never machine-translated
  ['badge', 'tagline', 'about'].forEach(k => { out[k] = str(he[k]) || tr(d[k]); });

  // Lists are matched by position: Hebrew line 1 replaces English line 1, etc.
  const heList = k => Array.isArray(he[k]) ? he[k] : [];
  out.services = (d.services || []).map((svc, i) => {
    if (str(heList('services')[i])) return str(heList('services')[i]);
    const p = String(svc).split('|');
    return p.length > 1 ? [p[0], tr(p[1]), p[2] ? tr(p[2]) : ''].join('|') : tr(svc);
  });
  ['specialties', 'areas', 'trustItems'].forEach(k => {
    out[k] = (d[k] || []).map((item, i) => str(heList(k)[i]) || tr(item));
  });

  const heT = Array.isArray(he.testimonials) ? he.testimonials : [];
  out.testimonials = (d.testimonials || []).map((t, i) => {
    const h = heT[i] || {};
    return { ...t, clientName: str(h.clientName) || t.clientName, text: str(h.text) || tr(t.text) };
  });

  if (d.popup) {
    const hp = he.popup || {};
    out.popup = { ...d.popup };
    ['title', 'text', 'btnText'].forEach(k => { out.popup[k] = str(hp[k]) || tr(d.popup[k]); });
  }
  return out;
}

// Cleans the "he" object coming from the admin panel before saving.
function sanitizeHe(input) {
  const src = input && typeof input === 'object' ? input : {};
  const list = v => Array.isArray(v) ? v.slice(0, 60).map(x => String(x == null ? '' : x).trim().slice(0, 600)) : [];
  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const p = src.popup && typeof src.popup === 'object' ? src.popup : {};
  return {
    name: s(src.name, 120), businessName: s(src.businessName, 160), badge: s(src.badge, 160),
    tagline: s(src.tagline, 400), about: s(src.about, 4000),
    services: list(src.services), specialties: list(src.specialties), areas: list(src.areas), trustItems: list(src.trustItems),
    testimonials: (Array.isArray(src.testimonials) ? src.testimonials : []).slice(0, 60)
      .map(t => ({ clientName: s(t && t.clientName, 120), text: s(t && t.text, 2000) })),
    popup: { title: s(p.title, 200), text: s(p.text, 600), btnText: s(p.btnText, 80) }
  };
}

module.exports = { makeT, localizeDesigner, sanitizeHe, ensureAutoTranslations, debugLog, _setTransport, HE };
