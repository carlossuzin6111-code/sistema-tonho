const db = require('../database');
const { listAuditLogs } = require('../services/auditService');

async function getOwnAuditLogs(req, res) {
  try {
    const logs = await listAuditLogs(db, req.user.id);
    return res.status(200).json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getOwnAuditLogs };
