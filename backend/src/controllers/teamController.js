const db = require('../database');
const { recordAudit } = require('../services/auditService');

async function listTeam(req, res) {
  try {
    const query = db('personal_team_memberships as tm')
      .join('users as u', 'u.id', 'tm.junior_personal_id')
      .select('tm.id', 'tm.head_personal_id', 'tm.junior_personal_id', 'tm.revenue_share_percent', 'tm.status', 'tm.joined_at', 'tm.ended_at', 'u.name as junior_name', 'u.email as junior_email')
      .where('tm.status', 'active');
    if (req.user.organizationRole === 'head') query.where('tm.head_personal_id', req.user.id);
    else query.where('tm.junior_personal_id', req.user.id);
    return res.json(await query.orderBy('tm.id'));
  } catch (error) {
    console.error('List team error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function addTeamMember(req, res) {
  if (req.user.organizationRole !== 'head') return res.status(403).json({ error: 'Only a head Personal can manage a team' });
  const { juniorPersonalId, revenueSharePercent = 0 } = req.body;
  const share = Number(revenueSharePercent);
  if (!Number.isInteger(Number(juniorPersonalId)) || Number(juniorPersonalId) <= 0 || !Number.isFinite(share) || share < 0 || share > 100) return res.status(400).json({ error: 'juniorPersonalId and revenueSharePercent (0-100) are required' });
  if (Number(juniorPersonalId) === req.user.id) return res.status(400).json({ error: 'A head cannot add itself as junior' });
  try {
    const junior = await db('users').where({ id: juniorPersonalId, role: 'personal' }).first();
    if (!junior) return res.status(404).json({ error: 'Junior Personal not found' });
    const membership = await db.transaction(async trx => {
      const existing = await trx('personal_team_memberships').where({ junior_personal_id: juniorPersonalId }).where('status', 'active').first();
      if (existing) { const error = new Error('Junior already belongs to an active team'); error.code = 'TEAM_MEMBER_EXISTS'; throw error; }
      const [id] = await trx('personal_team_memberships').insert({ head_personal_id: req.user.id, junior_personal_id: juniorPersonalId, revenue_share_percent: share, status: 'active' });
      await trx('users').where({ id: juniorPersonalId }).update({ organization_role: 'junior', updated_at: trx.fn.now() });
      await recordAudit(trx, { actorUserId: req.user.id, action: 'team.member_added', targetType: 'personal', targetId: juniorPersonalId, metadata: { membershipId: id, revenueSharePercent: share } });
      return trx('personal_team_memberships').where({ id }).first();
    });
    return res.status(201).json({ membership });
  } catch (error) {
    if (error.code === 'TEAM_MEMBER_EXISTS') return res.status(409).json({ error: error.message });
    console.error('Add team member error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function terminateTeamMember(req, res) {
  if (req.user.organizationRole !== 'head') return res.status(403).json({ error: 'Only a head Personal can manage a team' });
  const membershipId = Number(req.params.id);
  const transferToPersonalId = req.body?.transferToPersonalId ? Number(req.body.transferToPersonalId) : null;
  try {
    const membership = await db('personal_team_memberships').where({ id: membershipId, head_personal_id: req.user.id, status: 'active' }).first();
    if (!membership) return res.status(404).json({ error: 'Active team membership not found' });
    if (transferToPersonalId) {
      const target = await db('users').where({ id: transferToPersonalId, role: 'personal' }).first();
      if (!target || transferToPersonalId === membership.junior_personal_id) return res.status(400).json({ error: 'Invalid transfer target' });
    }
    await db.transaction(async trx => {
      if (transferToPersonalId) await trx('student_profiles').where({ personal_id: membership.junior_personal_id }).update({ personal_id: transferToPersonalId });
      await trx('personal_team_memberships').where({ id: membershipId, status: 'active' }).update({ status: 'ended', ended_at: trx.fn.now() });
      await trx('users').where({ id: membership.junior_personal_id }).update({ organization_role: 'standalone', updated_at: trx.fn.now() });
      await recordAudit(trx, { actorUserId: req.user.id, action: 'team.member_ended', targetType: 'personal', targetId: membership.junior_personal_id, metadata: { membershipId, transferToPersonalId } });
    });
    return res.json({ message: 'Team membership ended successfully', transferredStudentsTo: transferToPersonalId });
  } catch (error) {
    console.error('Terminate team member error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { addTeamMember, listTeam, terminateTeamMember };
