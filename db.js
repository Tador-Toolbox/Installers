const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── Schemas ─────────────────────────────────────────────────────────────────

const PortfolioImageSchema = new mongoose.Schema({
  url:        { type: String, required: true },
  publicId:   { type: String, required: true },
  status:     { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  uploadedAt: { type: Date, default: Date.now }
});

const TestimonialSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  text:       { type: String, required: true },
  rating:     { type: Number, min: 1, max: 5, default: 5 }
});

const NotificationSchema = new mongoose.Schema({
  message:   { type: String, required: true },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const InstallerSchema = new mongoose.Schema({
  slug:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true },
  password:     { type: String, required: true },

  // Public profile
  name:         { type: String, required: true },
  businessName: { type: String, default: '' },
  phone:        { type: String, default: '' },
  whatsapp:     { type: String, default: '' },
  tagline:      { type: String, default: '' },
  about:        { type: String, default: '' },
  services:     [{ type: String }],
  areas:        [{ type: String }],

  // Images
  profileImage: { url: String, publicId: String },
  heroImage:    { url: String, publicId: String },

  // Social
  facebook:     { type: String, default: '' },
  instagram:    { type: String, default: '' },

  // Content
  portfolioImages: [PortfolioImageSchema],
  testimonials:    [TestimonialSchema],
  notifications:   [NotificationSchema],

  // Meta
  isActive:   { type: Boolean, default: true },
  createdAt:  { type: Date, default: Date.now },
  lastLogin:  { type: Date },
  loginCount: { type: Number, default: 0 }
});

InstallerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

InstallerSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

const LeadSchema = new mongoose.Schema({
  installerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Installer', required: true },
  installerSlug: { type: String, required: true },
  name:          { type: String, required: true },
  phone:         { type: String, required: true },
  serviceType:   { type: String, default: '' },
  message:       { type: String, default: '' },
  read:          { type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now }
});

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

AdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

AdminSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};


// ─── Click Analytics ──────────────────────────────────────────────────────────
// Tracks CTA clicks on landing pages (call, whatsapp, quote)
const ClickEventSchema = new mongoose.Schema({
  installerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Installer', required: true },
  installerSlug: { type: String, required: true },
  type:          { type: String, enum: ['call', 'whatsapp', 'quote'], required: true },
  createdAt:     { type: Date, default: Date.now }
});

// ─── Models ──────────────────────────────────────────────────────────────────

const Installer   = mongoose.model('Installer', InstallerSchema);
const Lead        = mongoose.model('Lead', LeadSchema);
const Admin       = mongoose.model('Admin', AdminSchema);
const ClickEvent  = mongoose.model('ClickEvent', ClickEventSchema);

// ─── Seed Admin ──────────────────────────────────────────────────────────────

async function seedAdmin() {
  try {
    const exists = await Admin.findOne({ username: process.env.ADMIN_USERNAME });
    if (!exists) {
      await Admin.create({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123'
      });
      console.log('✅ Admin seeded');
    }
  } catch (e) {
    console.error('Seed admin error:', e.message);
  }
}

setTimeout(seedAdmin, 2000);

module.exports = { Installer, Lead, Admin, ClickEvent };
