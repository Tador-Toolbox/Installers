function requireInstaller(req, res, next) {
  if (req.session && req.session.installerId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { requireInstaller, requireAdmin };
