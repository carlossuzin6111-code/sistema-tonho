const db = require('../database');
const { ensureTrial } = require('../middleware/subscriptionGuard');

async function getSubscription(req, res) {
  try {
    let personalId = req.user.id;
    if (req.user.role === 'student') {
      const profile = await db('student_profiles').select('personal_id').where('student_id', req.user.id).first();
      if (!profile) return res.status(404).json({ error: 'Subscription not found' });
      personalId = profile.personal_id;
    }
    let subscription = await db('subscriptions').where({ personal_id: personalId }).orderBy('current_period_end', 'desc').first();
    if (!subscription) {
      await ensureTrial(personalId);
      subscription = await db('subscriptions').where({ personal_id: personalId }).orderBy('current_period_end', 'desc').first();
    }
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    return res.json({ id: subscription.id, status: subscription.status, provider: subscription.provider, currentPeriodStart: subscription.current_period_start, currentPeriodEnd: subscription.current_period_end, active: ['trial', 'active'].includes(subscription.status) && new Date(subscription.current_period_end).getTime() > Date.now() });
  } catch (error) {
    console.error('Get subscription error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getSubscription };
