const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── Shared Sub-Schemas ───────────────────────────────────────────

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

// ─── Installer Schema ─────────────────────────────────────────────

const InstallerSchema = new mongoose.Schema({
  slug:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true },
  password:     { type: String, required: true },
  name:         { type: String, required: true },
  businessName: { type: String, default: '' },
  phone:        { type: String, default: '' },
  whatsapp:     { type: String, default: '' },
  tagline:      { type: String, default: '' },
  about:        { type: String, default: '' },
  services:     [{ type: String }],
  areas:        [{ type: String }],
  profileImage: { url: String, publicId: String },
  heroImage:    { url: String, publicId: String },
  logo:         { url: String, publicId: String },
  facebook:     { type: String, default: '' },
  instagram:    { type: String, default: '' },
  badge:          { type: String, default: 'מומחה מוסמך ומנוסה' },
  checklistItems: [{ type: String }],
  trustItems:     [{ type: String }],
  template:       { type: String, enum: ['white','dark','red'], default: 'white' },
  popup: {
    active:    { type: Boolean, default: false },
    title:     { type: String, default: '' },
    text:      { type: String, default: '' },
    btnText:   { type: String, default: 'קבל הצעת מחיר' },
    image:     { url: String, publicId: String },
    delay:     { type: Number, default: 3 }
  },
  portfolioImages: [PortfolioImageSchema],
  testimonials:    [TestimonialSchema],
  notifications:   [NotificationSchema],
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

// ─── Designer Schema ──────────────────────────────────────────────

const DesignerSchema = new mongoose.Schema({
  slug:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  username:        { type: String, required: true, unique: true, trim: true },
  password:        { type: String, required: true },
  name:            { type: String, required: true },
  businessName:    { type: String, default: '' },
  phone:           { type: String, default: '' },
  whatsapp:        { type: String, default: '' },
  tagline:         { type: String, default: '' },
  about:           { type: String, default: '' },
  services:        [{ type: String }],
  areas:           [{ type: String }],
  specialties:     [{ type: String }],
  yearsExperience: { type: Number, default: 0 },
  projectsDone:    { type: Number, default: 0 },
  profileImage: { url: String, publicId: String },
  heroImage:    { url: String, publicId: String },
  logo:         { url: String, publicId: String },
  facebook:     { type: String, default: '' },
  instagram:    { type: String, default: '' },
  badge:          { type: String, default: 'מעצבת פנים מובילה' },
  checklistItems: [{ type: String }],
  trustItems:     [{ type: String }],
  template:       { type: String, enum: ['elegant','minimal','bold','industry','industry-en'], default: 'elegant' },
  popup: {
    active:    { type: Boolean, default: false },
    title:     { type: String, default: '' },
    text:      { type: String, default: '' },
    btnText:   { type: String, default: 'לייעוץ חינם' },
    image:     { url: String, publicId: String },
    delay:     { type: Number, default: 3 }
  },
  portfolioImages: [PortfolioImageSchema],
  testimonials:    [TestimonialSchema],
  notifications:   [NotificationSchema],
  isActive:   { type: Boolean, default: true },
  createdAt:  { type: Date, default: Date.now },
  lastLogin:  { type: Date },
  loginCount: { type: Number, default: 0 }
});

DesignerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
DesignerSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// ─── Lead Schemas ─────────────────────────────────────────────────

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

const DesignerLeadSchema = new mongoose.Schema({
  designerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Designer', required: true },
  designerSlug: { type: String, required: true },
  name:         { type: String, required: true },
  phone:        { type: String, required: true },
  serviceType:  { type: String, default: '' },
  message:      { type: String, default: '' },
  read:         { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now }
});

// ─── Admin Schema ─────────────────────────────────────────────────

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

// ─── Click Analytics ──────────────────────────────────────────────

const ClickEventSchema = new mongoose.Schema({
  installerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Installer', required: true },
  installerSlug: { type: String, required: true },
  type:          { type: String, enum: ['call', 'whatsapp', 'quote'], required: true },
  createdAt:     { type: Date, default: Date.now }
});

const DesignerClickEventSchema = new mongoose.Schema({
  designerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Designer', required: true },
  designerSlug: { type: String, required: true },
  type:         { type: String, enum: ['call', 'whatsapp', 'quote'], required: true },
  createdAt:    { type: Date, default: Date.now }
});

// ─── Order Schema ─────────────────────────────────────────────────

const OrderSchema = new mongoose.Schema({
  installerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Installer', required: true },
  installerSlug:  { type: String, required: true },
  installerName:  { type: String, required: true },
  installerPhone: { type: String, default: '' },
  orderType:      { type: String, required: true },
  notes:          { type: String, default: '' },
  status:         { type: String, enum: ['pending','processing','done'], default: 'pending' },
  read:           { type: Boolean, default: false },
  createdAt:      { type: Date, default: Date.now }
});

// ─── Models ───────────────────────────────────────────────────────

const Installer          = mongoose.model('Installer', InstallerSchema);
const Designer           = mongoose.model('Designer', DesignerSchema);
const Lead               = mongoose.model('Lead', LeadSchema);
const DesignerLead       = mongoose.model('DesignerLead', DesignerLeadSchema);
const Admin              = mongoose.model('Admin', AdminSchema);
const ClickEvent         = mongoose.model('ClickEvent', ClickEventSchema);
const DesignerClickEvent = mongoose.model('DesignerClickEvent', DesignerClickEventSchema);
const Order              = mongoose.model('Order', OrderSchema);

// ─── Seed Admin ───────────────────────────────────────────────────

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

module.exports = { Installer, Designer, Lead, DesignerLead, Admin, ClickEvent, DesignerClickEvent, Order };
