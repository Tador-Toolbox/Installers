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

// Returns a copy of the designer with Hebrew content swapped in wherever it exists.
function localizeDesigner(d, lang) {
  const he = d.he || {};
  if (lang !== 'he') return d;
  const out = { ...d };

  // Hebrew text if it was entered; otherwise, if the English text is one of the template's stock phrases, its stock translation.
  ['name', 'businessName', 'badge', 'tagline', 'about'].forEach(k => {
    if (str(he[k])) out[k] = str(he[k]);
    else if (HE[str(d[k])]) out[k] = HE[str(d[k])];
  });

  // Lists are matched by position: Hebrew line 1 replaces English line 1, etc.
  ['services', 'specialties', 'areas', 'trustItems'].forEach(k => {
    const heList = Array.isArray(he[k]) ? he[k] : [];
    out[k] = (d[k] || []).map((item, i) => str(heList[i]) || item);
  });

  const heT = Array.isArray(he.testimonials) ? he.testimonials : [];
  out.testimonials = (d.testimonials || []).map((t, i) => {
    const h = heT[i] || {};
    return { ...t, clientName: str(h.clientName) || t.clientName, text: str(h.text) || t.text };
  });

  if (d.popup) {
    const hp = he.popup || {};
    out.popup = { ...d.popup };
    ['title', 'text', 'btnText'].forEach(k => {
      if (str(hp[k])) out.popup[k] = str(hp[k]);
      else if (HE[str(d.popup[k])]) out.popup[k] = HE[str(d.popup[k])];
    });
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

module.exports = { makeT, localizeDesigner, sanitizeHe, HE };
