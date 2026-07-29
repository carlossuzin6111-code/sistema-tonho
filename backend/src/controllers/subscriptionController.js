const { getSubscriptionForUser } = require('../services/subscriptionService');

async function getCurrentSubscription(req, res) {
  try {
    const subscription = await getSubscriptionForUser(req.user);
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    return res.status(200).json({
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      gracePeriodEnd: subscription.grace_period_end
    });
  } catch (error) {
    console.error('Get subscription error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getCurrentSubscription };
