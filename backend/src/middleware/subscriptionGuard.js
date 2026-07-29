const db = require('../database');

const EXEMPT_PATHS = ['/api/subscription', '/api/profile/password', '/api/profile/waivers', '/api/auth/me', '/api/auth/logout'];

function isExempt(req) {
  return EXEMPT_PATHS.some(path => req.path === path || req.path.startsWith(`${path}/`));
}

async function ensureTrial(personalId) {
  const start = new Date().toISOString();
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db('subscriptions').insert({ personal_id: personalId, status: 'trial', provider: 'internal', current_period_start: start, current_period_end: end }).onConflict(['personal_id', 'status']).ignore();
}

async function subscriptionGuard(req, res, next) {
  if (!req.user || isExempt(req) || req.user.role === 'admin') return next();
  try {
    let personalId = req.user.id;
    if (req.user.role === 'student') {
      const profile = await db('student_profiles').select('personal_id').where('student_id', req.user.id).first();
      if (!profile) return res.status(402).json({ error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' });
      personalId = profile.personal_id;
    }
    let subscription = await db('subscriptions').where({ personal_id: personalId }).whereIn('status', ['trial', 'active']).orderBy('current_period_end', 'desc').first();
    if (!subscription) {
      const historical = await db('subscriptions').where({ personal_id: personalId }).first();
      if (!historical) await ensureTrial(personalId);
      subscription = await db('subscriptions').where({ personal_id: personalId }).whereIn('status', ['trial', 'active']).orderBy('current_period_end', 'desc').first();
    }
    if (!subscription || new Date(subscription.current_period_end).getTime() <= Date.now()) {
      return res.status(402).json({ error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' });
    }
    req.subscription = subscription;
    return next();
  } catch (error) {
    console.error('Subscription guard error:', error.message);
    return res.status(503).json({ error: 'Subscription status unavailable', code: 'SUBSCRIPTION_STATUS_UNAVAILABLE' });
  }
}

module.exports = { subscriptionGuard, ensureTrial };
