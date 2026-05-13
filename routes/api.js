const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const { Installer, Lead, Admin, ClickEvent } = require('../db');
const { requireInstaller, requireAdmin } = require('../middleware/auth');

// ─── Cloudinary config ───────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Validate Cloudinary config on startup
const cldConfig = cloudinary.config();
if(!cldConfig.cloud_name || !cldConfig.api_key || !cldConfig.api_secret){
  console.error('❌ Cloudinary config missing:', {
    cloud_name: !!cldConfig.cloud_name,
    api_key:    !!cldConfig.api_key,
    api_secret: !!cldConfig.api_secret
  });
} else {
  console.log('✅ Cloudinary configured:', cldConfig.cloud_name);
}

const makeStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: { folder, allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});

const profileUpload   = multer({ storage: makeStorage('installer_profiles') });
const heroUpload      = multer({ storage: makeStorage('installer_heroes') });
const portfolioUpload = multer({ storage: makeStorage('installer_portfolio') });

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

// Submit a lead from landing page
router.post('/leads', async (req, res) => {
  try {
    const { installerSlug, name, phone, serviceType, message } = req.body;
    if (!installerSlug || !name || !phone) return res.status(400).json({ error: 'Missing fields' });
    const installer = await Installer.findOne({ slug: installerSlug, isActive: true });
    if (!installer) return res.status(404).json({ error: 'Installer not found' });
    await Lead.create({ installerId: installer._id, installerSlug, name, phone, serviceType, message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Track a CTA click (call / whatsapp / quote) — fire-and-forget from landing page
router.post('/track', async (req, res) => {
  try {
    const { installerSlug, type } = req.body;
    if (!installerSlug || !['call', 'whatsapp', 'quote'].includes(type)) {
      return res.status(400).json({ error: 'Invalid params' });
    }
    const installer = await Installer.findOne({ slug: installerSlug, isActive: true }).select('_id');
    if (!installer) return res.status(404).json({ error: 'Not found' });
    await ClickEvent.create({ installerId: installer._id, installerSlug, type });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── AUTH ────────────────────────────────────────────────────────────────────

// Installer login
router.post('/auth/installer/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const installer = await Installer.findOne({ username, isActive: true });
    if (!installer || !(await installer.comparePassword(password))) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
    installer.lastLogin  = new Date();
    installer.loginCount = (installer.loginCount || 0) + 1;
    await installer.save();
    req.session.installerId   = installer._id.toString();
    req.session.installerSlug = installer.slug;
    res.json({ success: true, slug: installer.slug });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/auth/installer/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Admin login
router.post('/auth/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.isAdmin = true;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/auth/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Session check
router.get('/auth/me', (req, res) => {
  if (req.session.isAdmin) return res.json({ role: 'admin' });
  if (req.session.installerId) return res.json({ role: 'installer', installerId: req.session.installerId });
  res.json({ role: null });
});

// ─── INSTALLER DASHBOARD ─────────────────────────────────────────────────────

// Get own profile
router.get('/installer/profile', requireInstaller, async (req, res) => {
  try {
    const inst = await Installer.findById(req.session.installerId)
      .select('-password');
    res.json(inst);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update profile (text fields)
router.put('/installer/profile', requireInstaller, async (req, res) => {
  try {
    const allowed = ['name','businessName','phone','whatsapp','tagline','about','services','areas','facebook','instagram'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const inst = await Installer.findByIdAndUpdate(req.session.installerId, updates, { new: true }).select('-password');
    res.json(inst);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload profile image
router.post('/installer/profile-image', requireInstaller, profileUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const inst = await Installer.findById(req.session.installerId);
    if (inst.profileImage?.publicId) {
      await cloudinary.uploader.destroy(inst.profileImage.publicId).catch(() => {});
    }
    inst.profileImage = { url: req.file.path, publicId: req.file.filename };
    await inst.save();
    res.json({ url: req.file.path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload hero image
router.post('/installer/hero-image', requireInstaller, heroUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const inst = await Installer.findById(req.session.installerId);
    if (inst.heroImage?.publicId) {
      await cloudinary.uploader.destroy(inst.heroImage.publicId).catch(() => {});
    }
    inst.heroImage = { url: req.file.path, publicId: req.file.filename };
    await inst.save();
    res.json({ url: req.file.path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload portfolio image (goes to pending)
router.post('/installer/portfolio', requireInstaller, portfolioUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const inst = await Installer.findById(req.session.installerId);
    inst.portfolioImages.push({ url: req.file.path, publicId: req.file.filename });
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    console.error('❌ Portfolio upload error:', e.message, e.http_code || '');
    res.status(500).json({ error: e.message });
  }
});

// Delete portfolio image
router.delete('/installer/portfolio/:imgId', requireInstaller, async (req, res) => {
  try {
    const inst = await Installer.findById(req.session.installerId);
    const img = inst.portfolioImages.id(req.params.imgId);
    if (!img) return res.status(404).json({ error: 'Not found' });
    await cloudinary.uploader.destroy(img.publicId).catch(() => {});
    img.deleteOne();
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Testimonials CRUD
router.post('/installer/testimonials', requireInstaller, async (req, res) => {
  try {
    const { clientName, text, rating } = req.body;
    const inst = await Installer.findById(req.session.installerId);
    inst.testimonials.push({ clientName, text, rating });
    await inst.save();
    res.json(inst.testimonials);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/installer/testimonials/:id', requireInstaller, async (req, res) => {
  try {
    const inst = await Installer.findById(req.session.installerId);
    inst.testimonials.id(req.params.id)?.deleteOne();
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get leads
router.get('/installer/leads', requireInstaller, async (req, res) => {
  try {
    const leads = await Lead.find({ installerId: req.session.installerId }).sort({ createdAt: -1 });
    // Mark all as read
    await Lead.updateMany({ installerId: req.session.installerId, read: false }, { read: true });
    res.json(leads);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get unread leads count
router.get('/installer/leads/unread-count', requireInstaller, async (req, res) => {
  try {
    const count = await Lead.countDocuments({ installerId: req.session.installerId, read: false });
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get notifications
router.get('/installer/notifications', requireInstaller, async (req, res) => {
  try {
    const inst = await Installer.findById(req.session.installerId).select('notifications');
    const notifs = (inst.notifications || []).sort((a, b) => b.createdAt - a.createdAt);
    // Mark read
    inst.notifications.forEach(n => n.read = true);
    await inst.save();
    res.json(notifs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unread notification count
router.get('/installer/notifications/unread-count', requireInstaller, async (req, res) => {
  try {
    const inst = await Installer.findById(req.session.installerId).select('notifications');
    const count = (inst.notifications || []).filter(n => !n.read).length;
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Change own password
router.put('/installer/password', requireInstaller, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const inst = await Installer.findById(req.session.installerId);
    if (!(await inst.comparePassword(currentPassword))) {
      return res.status(401).json({ error: 'סיסמה נוכחית שגויה' });
    }
    inst.password = newPassword;
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN ───────────────────────────────────────────────────────────────────

// Get all installers
router.get('/admin/installers', requireAdmin, async (req, res) => {
  try {
    const installers = await Installer.find()
      .select('-password -notifications -testimonials')
      .sort({ createdAt: -1 });

    // Attach unread leads count per installer
    const withLeads = await Promise.all(installers.map(async inst => {
      const unreadLeads  = await Lead.countDocuments({ installerId: inst._id, read: false });
      const totalLeads   = await Lead.countDocuments({ installerId: inst._id });
      const pendingPhotos = inst.portfolioImages.filter(p => p.status === 'pending').length;
      return { ...inst.toObject(), unreadLeads, totalLeads, pendingPhotos };
    }));
    res.json(withLeads);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create installer
router.post('/admin/installers', requireAdmin, async (req, res) => {
  try {
    const { username, password, name, slug } = req.body;
    if (!username || !password || !name || !slug) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const inst = await Installer.create({ username, password, name, slug: cleanSlug });
    res.json({ success: true, slug: inst.slug });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Username or slug already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Toggle installer active
router.put('/admin/installers/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const inst = await Installer.findById(req.params.id);
    if (!inst) return res.status(404).json({ error: 'Not found' });
    inst.isActive = !inst.isActive;
    await inst.save();
    res.json({ isActive: inst.isActive });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete installer
router.delete('/admin/installers/:id', requireAdmin, async (req, res) => {
  try {
    await Installer.findByIdAndDelete(req.params.id);
    await Lead.deleteMany({ installerId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset installer password
router.put('/admin/installers/:id/password', requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const inst = await Installer.findById(req.params.id);
    inst.password = newPassword;
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update installer username and/or password
router.put('/admin/installers/:id/credentials', requireAdmin, async (req, res) => {
  try {
    const { newPassword, newUsername } = req.body;
    const inst = await Installer.findById(req.params.id);
    if(!inst) return res.status(404).json({ error: 'Not found' });
    if(newUsername){
      const exists = await Installer.findOne({ username: newUsername, _id: { $ne: inst._id } });
      if(exists) return res.status(400).json({ error: 'שם המשתמש כבר קיים במערכת' });
      inst.username = newUsername;
    }
    if(newPassword) inst.password = newPassword;
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all pending portfolio images across all installers
router.get('/admin/portfolio/pending', requireAdmin, async (req, res) => {
  try {
    const installers = await Installer.find({ 'portfolioImages.status': 'pending' })
      .select('name slug portfolioImages');
    const pending = [];
    for (const inst of installers) {
      for (const img of inst.portfolioImages) {
        if (img.status === 'pending') {
          pending.push({
            installerId:   inst._id,
            installerName: inst.name,
            installerSlug: inst.slug,
            image:         img
          });
        }
      }
    }
    res.json(pending);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Approve/reject portfolio image
router.put('/admin/portfolio/:installerId/:imgId', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const inst = await Installer.findById(req.params.installerId);
    const img  = inst.portfolioImages.id(req.params.imgId);
    if (!img) return res.status(404).json({ error: 'Image not found' });
    img.status = status;
    if (status === 'rejected') {
      await cloudinary.uploader.destroy(img.publicId).catch(() => {});
      img.deleteOne();
    }
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all leads (admin)
router.get('/admin/leads', requireAdmin, async (req, res) => {
  try {
    const { installerId } = req.query;
    const filter = installerId ? { installerId } : {};
    const leads = await Lead.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json(leads);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send notification to installer
router.post('/admin/notify/:installerId', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const inst = await Installer.findById(req.params.installerId);
    if (!inst) return res.status(404).json({ error: 'Installer not found' });
    inst.notifications.push({ message });
    await inst.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin analytics overview
router.get('/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const monthStart = new Date(new Date().setDate(1));
    monthStart.setHours(0,0,0,0);

    const [
      totalInstallers, activeInstallers,
      totalLeads, leadsThisMonth,
      pendingPhotos,
      topInstallers, loginActivity,
      totalCalls, callsThisMonth,
      totalWhatsapp, whatsappThisMonth,
      totalQuote,
      clicksByInstaller
    ] = await Promise.all([
      Installer.countDocuments(),
      Installer.countDocuments({ isActive: true }),
      Lead.countDocuments(),
      Lead.countDocuments({ createdAt: { $gte: monthStart } }),
      Installer.aggregate([
        { $unwind: '$portfolioImages' },
        { $match: { 'portfolioImages.status': 'pending' } },
        { $count: 'count' }
      ]),
      Lead.aggregate([
        { $group: { _id: '$installerSlug', leads: { $sum: 1 } } },
        { $sort: { leads: -1 } }, { $limit: 5 }
      ]),
      Installer.find().select('name slug loginCount lastLogin').sort({ loginCount: -1 }).limit(10),

      // Click totals
      ClickEvent.countDocuments({ type: 'call' }),
      ClickEvent.countDocuments({ type: 'call', createdAt: { $gte: monthStart } }),
      ClickEvent.countDocuments({ type: 'whatsapp' }),
      ClickEvent.countDocuments({ type: 'whatsapp', createdAt: { $gte: monthStart } }),
      ClickEvent.countDocuments({ type: 'quote' }),

      // Click breakdown per installer (all types)
      ClickEvent.aggregate([
        { $group: {
            _id: { slug: '$installerSlug', type: '$type' },
            count: { $sum: 1 }
        }},
        { $group: {
            _id: '$_id.slug',
            clicks: { $push: { type: '$_id.type', count: '$count' } },
            total:  { $sum: '$count' }
        }},
        { $sort: { total: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      totalInstallers, activeInstallers,
      totalLeads, leadsThisMonth,
      pendingPhotos: pendingPhotos[0]?.count || 0,
      topInstallers, loginActivity,
      clicks: {
        call:            totalCalls,
        callThisMonth:   callsThisMonth,
        whatsapp:        totalWhatsapp,
        whatsappThisMonth,
        quote:           totalQuote,
        byInstaller:     clicksByInstaller
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Per-installer click breakdown (for drill-down)
router.get('/admin/analytics/clicks/:slug', requireAdmin, async (req, res) => {
  try {
    const { slug } = req.params;
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totals, timeline] = await Promise.all([
      // Total by type
      ClickEvent.aggregate([
        { $match: { installerSlug: slug } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      // Daily breakdown last N days
      ClickEvent.aggregate([
        { $match: { installerSlug: slug, createdAt: { $gte: since } } },
        { $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              type: '$type'
            },
            count: { $sum: 1 }
        }},
        { $sort: { '_id.date': 1 } }
      ])
    ]);

    res.json({ slug, totals, timeline });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
