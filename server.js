require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const path       = require('path');

require('./db');
const { Installer } = require('./db');
const apiRouter     = require('./routes/api');

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
  cookie:            { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api', apiRouter);

// ─── Admin Panel ──────────────────────────────────────────────────────────────

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/index.html'));
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/index.html'));
});

// ─── Public Landing Pages ─────────────────────────────────────────────────────

app.get('/:slug', async (req, res, next) => {
  // Skip known static routes
  const skip = ['admin', 'dashboard', 'api', 'favicon.ico', 'assets'];
  if (skip.includes(req.params.slug)) return next();

  try {
    const installer = await Installer.findOne({
      slug:     req.params.slug.toLowerCase(),
      isActive: true
    });

    if (!installer) return res.status(404).render('404');

    // Only show approved portfolio images
    const approvedPortfolio = installer.portfolioImages.filter(p => p.status === 'approved');

    res.render('landing', {
      installer: {
        ...installer.toObject(),
        portfolioImages: approvedPortfolio
      }
    });
  } catch (e) {
    next(e);
  }
});

// ─── Home ─────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h1>🏠 Installer Landing Pages</h1>
      <p>Visit <strong>/admin</strong> to manage installers</p>
      <p>Visit <strong>/dashboard</strong> to access your installer panel</p>
    </body></html>
  `);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
