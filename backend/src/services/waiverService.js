const db = require('../database');

const CURRENT_TERMS_VERSION = process.env.TERMS_VERSION || '2026.1';
const PARQ_KEYS = Object.freeze([
  'heartCondition',
  'chestPainActivity',
  'chestPainRest',
  'balanceOrConsciousness',
  'boneOrJointProblem',
  'bloodPressureMedication',
  'otherReason'
]);

function validateWaiverAnswers(parqAnswers) {
  if (!parqAnswers || typeof parqAnswers !== 'object' || Array.isArray(parqAnswers)) return false;
  if (parqAnswers.acceptedTerms !== true) return false;
  return PARQ_KEYS.every(key => typeof parqAnswers[key] === 'boolean');
}

async function findCurrentWaiver(userId, database = db) {
  return database('signed_waivers')
    .where({ user_id: userId, terms_version: CURRENT_TERMS_VERSION })
    .first();
}

module.exports = { CURRENT_TERMS_VERSION, PARQ_KEYS, findCurrentWaiver, validateWaiverAnswers };
