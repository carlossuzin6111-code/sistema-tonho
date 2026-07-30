function readinessScore({ doms, sleepQuality, fatigue, mood }) {
  // DOMS/fatigue are risk signals (lower is better); sleep/mood are recovery
  // signals (higher is better), all normalized to a 0..100 score.
  return Math.round((((6 - doms) + sleepQuality + (6 - fatigue) + mood) / 20) * 100 * 10) / 10;
}

function recommendation(values) {
  const score = readinessScore(values);
  if (values.sleepQuality <= 2 || values.fatigue >= 4 || values.doms >= 4) return { code: 'recovery', label: 'Priorizar recuperação', volumeMultiplier: 0.8, score };
  if (values.mood <= 2 || score < 55) return { code: 'maintain', label: 'Manter carga com cautela', volumeMultiplier: 0.9, score };
  return { code: 'normal', label: 'Treino normal', volumeMultiplier: 1, score };
}

module.exports = { readinessScore, recommendation };
