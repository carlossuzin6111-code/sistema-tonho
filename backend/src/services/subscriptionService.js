const db = require('../database');

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function isSubscriptionActive(subscription, now = Date.now()) {
  if (!subscription) return false;
  const periodEnd = new Date(subscription.current_period_end).getTime();
  const graceEnd = subscription.grace_period_end ? new Date(subscription.grace_period_end).getTime() : 0;
  if (ACTIVE_STATUSES.has(subscription.status)) return periodEnd > now;
  if (subscription.status === 'past_due') return graceEnd > now;
  if (subscription.status === 'canceled') return periodEnd > now;
  return false;
}

async function getPersonalId(user) {
  if (user.role === 'personal') return user.id;
  const profile = await db('student_profiles').select('personal_id').where('student_id', user.id).first();
  return profile?.personal_id || null;
}

async function ensureTrial(personalId) {
  if (!personalId) return null;
  let subscription = await db('subscriptions').where({ personal_id: personalId }).first();
  if (subscription) return subscription;
  const currentPeriodEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await db('subscriptions').insert({ personal_id: personalId, plan: 'trial', status: 'trialing', current_period_end: currentPeriodEnd });
  } catch (error) {
    if (!/unique|constraint/i.test(error.message)) throw error;
  }
  subscription = await db('subscriptions').where({ personal_id: personalId }).first();
  return subscription;
}

async function getSubscriptionForUser(user) {
  return ensureTrial(await getPersonalId(user));
}

async function subscriptionGate(req, res, next) {
  if (!req.user || !req.user.role || !['personal', 'student'].includes(req.user.role)) return next();
  const path = req.path || req.originalUrl?.split('?')[0] || '';
  if (path === '/api/health' || path.startsWith('/api/auth/') || path === '/api/subscription'
    || path === '/api/profile/waivers' || req.user.mustChangePassword) return next();
  try {
    const subscription = await getSubscriptionForUser(req.user);
    if (!isSubscriptionActive(subscription)) {
      return res.status(402).json({ error: 'Active subscription required', code: 'SUBSCRIPTION_EXPIRED' });
    }
    req.subscription = subscription;
    return next();
  } catch (error) {
    console.error('Subscription gate error:', error.message);
    return res.status(503).json({ error: 'Subscription status unavailable' });
  }
}

module.exports = { ACTIVE_STATUSES, getPersonalId, getSubscriptionForUser, isSubscriptionActive, subscriptionGate };
