require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const path       = require('path');

require('./db');
const { Installer, Designer } = require('./db');
const apiRouter        = require('./routes/api');
const designerApiRouter = require('./routes/designer-api');
const { makeT, localizeDesigner, ensureAutoTranslations } = require('./lib/designer-i18n');

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'secret',
  resave:            false,
  saveUninitialized: false,
  store:             MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie:            { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api', apiRouter);
app.use('/api', designerApiRouter);

// ─── Business Card Generator (Admin) ─────────────────────────────────────────

app.get('/admin/business-card/:slug', async (req, res) => {
  try {
    const installer = await Installer.findOne({ slug: req.params.slug });
    if (!installer) return res.status(404).send('Not found');
    res.render('business-card', { installer });
  } catch(e) { res.status(500).send(e.message); }
});

// ─── Admin Panel ──────────────────────────────────────────────────────────────

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/index.html'));
});

// ─── Installer Dashboard ──────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/index.html'));
});

// ─── Designer Dashboard ───────────────────────────────────────────────────────

app.get('/designer-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/designer-dashboard/index.html'));
});

// ─── Designer Login Page ──────────────────────────────────────────────────────

app.get('/designer-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/designer-login/index.html'));
});

// ─── Designer Public Landing Pages ───────────────────────────────────────────

app.get('/d/:slug', async (req, res) => {
  try {
    const designer = await Designer.findOne({
      slug:     req.params.slug.toLowerCase(),
      isActive: true
    });
    if (!designer) return res.status(404).render('404');

    const approvedPortfolio = designer.portfolioImages.filter(p => p.status === 'approved');
    const view = designer.template === 'industry-en' ? 'designer-landing-en'
               : designer.template === 'industry-en-v2' ? 'designer-landing-en-v2'
               : 'designer-landing';

    // English templates have a Hebrew version: /d/<slug>?lang=he
    const isEnglishTemplate = view !== 'designer-landing';
    const lang = (isEnglishTemplate && req.query.lang === 'he') ? 'he' : 'en';
    const plain = { ...designer.toObject(), portfolioImages: approvedPortfolio };
    // Hebrew page: machine-translate any English text that has no Hebrew yet (done once, then cached on the designer)
    const autoMap = lang === 'he'
      ? await ensureAutoTranslations(plain, map => Designer.updateOne({ _id: designer._id }, { $set: { heAuto: map } }))
      : null;
    const designerData = localizeDesigner(plain, lang, autoMap);

    res.render(view, { designer: designerData, lang, T: makeT(lang) });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// ─── Installer Public Landing Pages ──────────────────────────────────────────

app.get('/:slug', async (req, res, next) => {
  const skip = ['admin','dashboard','api','favicon.ico','assets','designer-dashboard','designer-login','d'];
  if (skip.includes(req.params.slug)) return next();

  try {
    const installer = await Installer.findOne({
      slug:     req.params.slug.toLowerCase(),
      isActive: true
    });

    if (!installer) return res.status(404).render('404');

    const approvedPortfolio = installer.portfolioImages.filter(p => p.status === 'approved');
    const templateMap = { dark: 'landing-dark', red: 'landing-red', white: 'landing' };
    const view = templateMap[installer.template] || 'landing';

    res.render(view, {
      installer: { ...installer.toObject(), portfolioImages: approvedPortfolio }
    });
  } catch (e) {
    next(e);
  }
});

// ─── Home ─────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h1>🏠 Installer & Designer Landing Pages</h1>
      <p>Visit <strong>/admin</strong> to manage everything</p>
    </body></html>
  `);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
