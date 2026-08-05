const { CURRENT_TERMS_VERSION, findCurrentWaiver } = require('../services/waiverService');

const EXEMPT_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/profile/password',
  '/api/profile/waivers/current',
  '/api/profile/waivers',
  '/api/compliance/export',
  '/api/compliance/delete',
  '/api/sessions'
]);

function isExempt(req) {
  const path = req.path || req.originalUrl?.split('?')[0] || '';
  return EXEMPT_PATHS.has(path)
    || path.startsWith('/api/auth/')
    || path.startsWith('/api/sessions/')
    || path === '/api/health'
    || path.startsWith('/health/');
}

async function requireCurrentWaiver(req, res, next) {
  if (!req.user || req.user.role !== 'student' || req.user.mustChangePassword || isExempt(req)) return next();
  try {
    if (await findCurrentWaiver(req.user.id)) return next();
    return res.status(428).json({
      error: 'Current PAR-Q and terms acceptance required',
      code: 'WAIVER_REQUIRED',
      termsVersion: CURRENT_TERMS_VERSION
    });
  } catch (error) {
    console.error('Waiver gate error:', error.message);
    return res.status(503).json({ error: 'Unable to verify current terms acceptance' });
  }
}

module.exports = { requireCurrentWaiver };
