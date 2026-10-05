const express    = require('express');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt     = require('bcryptjs');
const router     = express.Router();

const { Designer, DesignerLead, DesignerClickEvent } = require('../db');

cloudinary.config({
  cloud_name:    process.env.CLOUDINARY_CLOUD_NAME,
  api_key:       process.env.CLOUDINARY_API_KEY,
  api_secret:    process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });

// ── Cloudinary upload helper ──────────────────────────────────────
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

// ── Auth middleware ───────────────────────────────────────────────
function requireDesigner(req, res, next) {
  if (req.session && req.session.designerId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ────────────────────────────────────────────────────────────────────

// POST /api/designer/login
router.post('/designer/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const designer = await Designer.findOne({ username: username.trim() });
    if (!designer) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    if (!designer.isActive) return res.status(403).json({ error: 'החשבון אינו פעיל' });
    const valid = await designer.comparePassword(password);
    if (!valid) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    designer.lastLogin  = new Date();
    designer.loginCount = (designer.loginCount || 0) + 1;
    await designer.save();
    req.session.designerId   = designer._id.toString();
    req.session.designerSlug = designer.slug;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/designer/logout
router.post('/designer/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// POST /api/designer/lead/:slug  — public lead submission
router.post('/designer/lead/:slug', async (req, res) => {
  try {
    const designer = await Designer.findOne({ slug: req.params.slug, isActive: true });
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const { name, phone, serviceType, message } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'שם וטלפון הם שדות חובה' });
    const lead = await DesignerLead.create({
      designerId:   designer._id,
      designerSlug: designer.slug,
      name, phone,
      serviceType: serviceType || '',
      message:     message || ''
    });
    // Add notification to designer
    designer.notifications.push({ message: `ליד חדש: ${name} (${phone})` });
    await designer.save();
    res.json({ ok: true, id: lead._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/designer/click/:slug  — click analytics
router.post('/designer/click/:slug', async (req, res) => {
  try {
    const designer = await Designer.findOne({ slug: req.params.slug });
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const { type } = req.body;
    if (!['call','whatsapp','quote'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    await DesignerClickEvent.create({ designerId: designer._id, designerSlug: designer.slug, type });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// DESIGNER AUTH ROUTES (require session)
// ────────────────────────────────────────────────────────────────────

// GET /api/designer/me
router.get('/designer/me', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId).select('-password');
    if (!designer) return res.status(404).json({ error: 'Not found' });
    res.json(designer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/designer/profile
router.put('/designer/profile', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const fields = ['name','businessName','phone','whatsapp','tagline','about',
                    'facebook','instagram','badge','yearsExperience','projectsDone'];
    fields.forEach(f => { if (req.body[f] !== undefined) designer[f] = req.body[f]; });
    if (req.body.services)      designer.services      = req.body.services;
    if (req.body.areas)         designer.areas         = req.body.areas;
    if (req.body.specialties)   designer.specialties   = req.body.specialties;
    if (req.body.checklistItems) designer.checklistItems = req.body.checklistItems;
    if (req.body.trustItems)    designer.trustItems    = req.body.trustItems;
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/designer/upload-image  (profile, hero, logo)
router.post('/designer/upload-image', requireDesigner, upload.single('image'), async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const type = req.body.type; // 'profile' | 'hero' | 'logo'
    if (!['profile','hero','logo'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    // Delete old from Cloudinary
    const fieldMap = { profile: 'profileImage', hero: 'heroImage', logo: 'logo' };
    const field = fieldMap[type];
    if (designer[field] && designer[field].publicId) {
      await cloudinary.uploader.destroy(designer[field].publicId).catch(() => {});
    }
    const result = await uploadToCloudinary(req.file.buffer, {
      folder:    `designers/${designer.slug}`,
      public_id: `${type}_${Date.now()}`,
      resource_type: 'image'
    });
    designer[field] = { url: result.secure_url, publicId: result.public_id };
    await designer.save();
    res.json({ ok: true, url: result.secure_url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/designer/portfolio  — upload portfolio image
router.post('/designer/portfolio', requireDesigner, upload.single('image'), async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const result = await uploadToCloudinary(req.file.buffer, {
      folder:    `designers/${designer.slug}/portfolio`,
      public_id: `port_${Date.now()}`,
      resource_type: 'image'
    });
    designer.portfolioImages.push({ url: result.secure_url, publicId: result.public_id, status: 'pending' });
    await designer.save();
    const img = designer.portfolioImages[designer.portfolioImages.length - 1];
    res.json({ ok: true, image: img });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/designer/portfolio/:imageId
router.delete('/designer/portfolio/:imageId', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const img = designer.portfolioImages.id(req.params.imageId);
    if (!img) return res.status(404).json({ error: 'Image not found' });
    await cloudinary.uploader.destroy(img.publicId).catch(() => {});
    img.deleteOne();
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/designer/leads
router.get('/designer/leads', requireDesigner, async (req, res) => {
  try {
    const leads = await DesignerLead.find({ designerId: req.session.designerId })
      .sort({ createdAt: -1 }).limit(100);
    // Mark all as read
    await DesignerLead.updateMany({ designerId: req.session.designerId, read: false }, { read: true });
    res.json(leads);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/designer/leads/unread-count
router.get('/designer/leads/unread-count', requireDesigner, async (req, res) => {
  try {
    const count = await DesignerLead.countDocuments({ designerId: req.session.designerId, read: false });
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/designer/popup
router.put('/designer/popup', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const { active, title, text, btnText, delay } = req.body;
    if (active    !== undefined) designer.popup.active  = active;
    if (title     !== undefined) designer.popup.title   = title;
    if (text      !== undefined) designer.popup.text    = text;
    if (btnText   !== undefined) designer.popup.btnText = btnText;
    if (delay     !== undefined) designer.popup.delay   = delay;
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/designer/popup/image
router.post('/designer/popup/image', requireDesigner, upload.single('image'), async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    if (designer.popup.image && designer.popup.image.publicId) {
      await cloudinary.uploader.destroy(designer.popup.image.publicId).catch(() => {});
    }
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: `designers/${designer.slug}`, public_id: `popup_${Date.now()}`
    });
    designer.popup.image = { url: result.secure_url, publicId: result.public_id };
    await designer.save();
    res.json({ ok: true, url: result.secure_url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/designer/notifications
router.get('/designer/notifications', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    const notifs = designer.notifications.sort((a, b) => b.createdAt - a.createdAt);
    res.json(notifs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/designer/notifications/read-all
router.put('/designer/notifications/read-all', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    designer.notifications.forEach(n => n.read = true);
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Testimonials ─────────────────────────────────────────────────
router.post('/designer/testimonial', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    designer.testimonials.push(req.body);
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/designer/testimonial/:id', requireDesigner, async (req, res) => {
  try {
    const designer = await Designer.findById(req.session.designerId);
    designer.testimonials.id(req.params.id).deleteOne();
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// ADMIN DESIGNER ROUTES (require admin session)
// ────────────────────────────────────────────────────────────────────

// GET /api/admin/designers
router.get('/admin/designers', requireAdmin, async (req, res) => {
  try {
    const designers = await Designer.find({}).select('-password').sort({ createdAt: -1 });
    res.json(designers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/designers  — create designer
router.post('/admin/designers', requireAdmin, async (req, res) => {
  try {
    const { name, slug, username, password, phone } = req.body;
    if (!name || !slug || !username || !password) return res.status(400).json({ error: 'חסרים שדות חובה' });
    const exists = await Designer.findOne({ $or: [{ slug }, { username }] });
    if (exists) return res.status(409).json({ error: 'slug או username כבר קיים' });
    const designer = await Designer.create({ name, slug, username, password, phone: phone || '' });
    res.json({ ok: true, designer: { _id: designer._id, name, slug, username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/designers/:id  — update designer (admin)
router.put('/admin/designers/:id', requireAdmin, async (req, res) => {
  try {
    const designer = await Designer.findById(req.params.id);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const { isActive, template, name, password } = req.body;
    if (isActive  !== undefined) designer.isActive  = isActive;
    if (template  !== undefined) designer.template  = template;
    if (name      !== undefined) designer.name      = name;
    if (password) {
      designer.password = password; // will be hashed by pre-save
    }
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/designers/:id
router.delete('/admin/designers/:id', requireAdmin, async (req, res) => {
  try {
    await Designer.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/designers/:id/leads
router.get('/admin/designers/:id/leads', requireAdmin, async (req, res) => {
  try {
    const leads = await DesignerLead.find({ designerId: req.params.id }).sort({ createdAt: -1 });
    res.json(leads);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/designer-portfolio/:designerId/:imageId/status
router.put('/admin/designer-portfolio/:designerId/:imageId/status', requireAdmin, async (req, res) => {
  try {
    const designer = await Designer.findById(req.params.designerId);
    if (!designer) return res.status(404).json({ error: 'Not found' });
    const img = designer.portfolioImages.id(req.params.imageId);
    if (!img) return res.status(404).json({ error: 'Image not found' });
    img.status = req.body.status; // approved | rejected
    await designer.save();
    // Notify designer
    const statusLabel = req.body.status === 'approved' ? 'אושרה ✅' : 'נדחתה ❌';
    designer.notifications.push({ message: `תמונה בפורטפוליו ${statusLabel}` });
    await designer.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
