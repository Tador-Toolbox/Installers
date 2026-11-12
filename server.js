require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const path       = require('path');

require('./db');
const { Installer, Designer } = require('./db');
const apiRouter        = require('./routes/api');
const designerApiRouter = require('./routes/designer-api');
const { makeT, localizeDesigner } = require('./lib/designer-i18n');

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

// Words that can never be a designer short link (they are real pages of the site)
const RESERVED = ['admin','dashboard','api','favicon.ico','assets','designer-dashboard','designer-login','d','he','en','uploads','public'];

// Share-preview image (WhatsApp / Facebook): the main (hero) image, cropped to 1200x630
function shareImage(d) {
  const url = (d.heroImage && d.heroImage.url) || (d.profileImage && d.profileImage.url)
           || ((d.portfolioImages || [])[0] || {}).url || '';
  return url.includes('res.cloudinary.com') && url.includes('/upload/')
    ? url.replace('/upload/', '/upload/c_fill,g_auto,w_1200,h_630,q_auto:good,f_jpg/')
    : url;
}

async function renderDesignerPage(req, res, designer, wantHe) {
  const approvedPortfolio = designer.portfolioImages.filter(p => p.status === 'approved');
  const view = designer.template === 'industry-en' ? 'designer-landing-en'
             : designer.template === 'industry-en-v2' ? 'designer-landing-en-v2'
             : 'designer-landing';

  // English templates have a Hebrew version
  const isEnglishTemplate = view !== 'designer-landing';
  const lang = (isEnglishTemplate && wantHe) ? 'he' : 'en';
  const designerData = localizeDesigner({ ...designer.toObject(), portfolioImages: approvedPortfolio }, lang);

  // Page addresses: the short link when there is one (installers.co.il/haia), otherwise /d/<slug>
  const short = designer.shortLink;
  const enPath = short ? `/${short}` : `/d/${designer.slug}`;
  const hePath = short ? `/${short}/he` : `/d/${designer.slug}?lang=he`;
  const origin = `https://${req.get('host')}`;
  const page = {
    enUrl: enPath, heUrl: hePath,
    canonical: origin + (lang === 'he' ? hePath : enPath),
    image: shareImage(designerData)
  };

  res.render(view, { designer: designerData, lang, T: makeT(lang), page });
}

app.get('/d/:slug', async (req, res) => {
  try {
    const designer = await Designer.findOne({
      slug:     req.params.slug.toLowerCase(),
      isActive: true
    });
    if (!designer) return res.status(404).render('404');
    await renderDesignerPage(req, res, designer, req.query.lang === 'he');
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// Short link, Hebrew version: installers.co.il/haia/he
app.get('/:short/he', async (req, res, next) => {
  try {
    const short = req.params.short.toLowerCase();
    if (RESERVED.includes(short)) return next();
    const designer = await Designer.findOne({ shortLink: short, isActive: true });
    if (!designer) return next();
    await renderDesignerPage(req, res, designer, true);
  } catch (e) { next(e); }
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

    if (!installer) {
      // not an installer page → maybe a designer's short link: installers.co.il/haia
      const designer = await Designer.findOne({ shortLink: req.params.slug.toLowerCase(), isActive: true });
      if (designer) return await renderDesignerPage(req, res, designer, req.query.lang === 'he');
      return res.status(404).render('404');
    }

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
