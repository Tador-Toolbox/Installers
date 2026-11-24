// ─── Sales CRM (/crm) — its own collections, separate from the landing-page models ───
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const STATUSES = ['new', 'no_answer', 'in_progress', 'quote_sent', 'closed_won', 'not_relevant'];

// Sales reps (the admin logs in with the existing site Admin account)
const CrmUserSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:  { type: String, required: true },
  fullName:  { type: String, required: true, trim: true },
  role:      { type: String, enum: ['sales'], default: 'sales' },
  seeAll:    { type: Boolean, default: false },   // admin setting: rep sees all leads, not only his own
  isActive:  { type: Boolean, default: true },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
CrmUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
CrmUserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// One entry in a lead's history — never overwritten, only appended
const CrmEntrySchema = new mongoose.Schema({
  type:   { type: String, enum: ['call', 'note', 'status', 'system'], default: 'note' },
  text:   { type: String, default: '' },
  at:     { type: Date, default: Date.now },
  byId:   { type: String, default: '' },
  byName: { type: String, default: '' },
  answered: { type: Boolean, default: true }   // call entries: false = no answer
});

const CrmLeadSchema = new mongoose.Schema({
  name:            { type: String, required: true, trim: true },
  phone:           { type: String, required: true, unique: true },   // normalized: 0501234567
  interest:        { type: String, default: '', trim: true },
  email:           { type: String, default: '', trim: true, lowercase: true },
  inquiryAt:       { type: Date, default: Date.now },   // when the customer reached out (can be before createdAt)
  assignedTo:      { type: mongoose.Schema.Types.ObjectId, ref: 'CrmUser', default: null },   // first assignee (kept for old data)
  assignees:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'CrmUser' }],                // all reps on this lead
  customerType:    { type: String, enum: ['', 'private', 'installer'], default: '' },
  status:          { type: String, enum: STATUSES, default: 'new' },
  lastCallAt:      { type: Date, default: null },
  followUpAt:      { type: Date, default: null },
  followUpHasTime: { type: Boolean, default: false },
  history:         [CrmEntrySchema],
  createdByName:   { type: String, default: '' },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now }
});
CrmLeadSchema.index({ assignedTo: 1 });

const CrmUser = mongoose.model('CrmUser', CrmUserSchema);
const CrmLead = mongoose.model('CrmLead', CrmLeadSchema);

// Israeli phone → "0501234567". Returns '' when invalid.
// Examples: "+972-50-123-4567" → "0501234567", "03-1234567" → "031234567", "12345" → ""
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (!d.startsWith('0')) d = '0' + d;
  if (/^05\d{8}$/.test(d)) return d;          // mobile 05X-XXXXXXX
  if (/^07\d{8}$/.test(d)) return d;          // 07X VoIP
  if (/^0[23489]\d{7}$/.test(d)) return d;    // landline 0X-XXXXXXX
  return '';
}

// All reps on a lead as strings. Old leads only have assignedTo → [assignedTo]
function assigneeIds(lead) {
  const a = (lead.assignees || []).map(String);
  if (a.length) return a;
  return lead.assignedTo ? [String(lead.assignedTo)] : [];
}

module.exports = { CrmUser, CrmLead, STATUSES, normalizePhone, assigneeIds };
