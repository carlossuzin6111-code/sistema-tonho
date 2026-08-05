const { CURRENT_TERMS_VERSION } = require('../../services/waiverService');

async function acceptCurrentWaiver(database, userId) {
  await database('signed_waivers').insert({
    user_id: userId,
    terms_version: CURRENT_TERMS_VERSION,
    parq_answers: JSON.stringify({
      heartCondition: false,
      chestPainActivity: false,
      chestPainRest: false,
      balanceOrConsciousness: false,
      boneOrJointProblem: false,
      bloodPressureMedication: false,
      otherReason: false,
      acceptedTerms: true
    }),
    ip_address: '127.0.0.1'
  }).onConflict(['user_id', 'terms_version']).ignore();
}

module.exports = { acceptCurrentWaiver };
