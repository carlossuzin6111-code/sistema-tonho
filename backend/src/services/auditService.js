const AUDIT_ACTIONS = Object.freeze({
  MEASUREMENT_CREATED: 'measurement.created',
  PASSWORD_RESET: 'student.password_reset',
  WORKOUT_DELETED: 'workout.deleted',
  WORKOUT_EXERCISE_DELETED: 'workout_exercise.deleted',
  CATALOG_EXERCISE_DELETED: 'catalog_exercise.deleted'
});

async function recordAudit(database, { actorUserId, action, targetType, targetId, metadata = null }) {
  await database('audit_logs').insert({
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: String(targetId),
    metadata: metadata ? JSON.stringify(metadata) : null
  });
}

function parseMetadata(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function listAuditLogs(database, actorUserId, limit = 100) {
  const rows = await database('audit_logs')
    .select('id', 'action', 'target_type', 'target_id', 'metadata', 'created_at')
    .where({ actor_user_id: actorUserId })
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit);
  return rows.map(row => ({ ...row, metadata: parseMetadata(row.metadata) }));
}

module.exports = { AUDIT_ACTIONS, listAuditLogs, recordAudit };
