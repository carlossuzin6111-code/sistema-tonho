const db = require('../database');

async function resolveAccess(req, studentId) {
  if (req.user.role === 'student') return req.user.id === studentId;
  if (req.user.role !== 'personal') return false;
  return Boolean(await db('student_profiles').where({ student_id: studentId, personal_id: req.user.id }).first());
}

function publicAssessment(row, includePrivate) {
  const result = { id: row.id, student_id: row.student_id, personal_id: row.personal_id, experience_level: row.experience_level, anatomical_limitations: row.anatomical_limitations, clinical_injuries: row.clinical_injuries, student_notes: row.student_notes, created_at: row.created_at, updated_at: row.updated_at };
  if (includePrivate) result.personal_notes = row.personal_notes;
  return result;
}

async function listAssessments(req, res) {
  const studentId = Number(req.params.id);
  try {
    if (!(await resolveAccess(req, studentId))) return res.status(403).json({ error: 'Assessment access forbidden' });
    const rows = await db('student_assessments').where({ student_id: studentId }).orderBy('created_at', 'desc');
    return res.json(rows.map(row => publicAssessment(row, req.user.role === 'personal')));
  } catch (error) {
    console.error('List assessments error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createAssessment(req, res) {
  const studentId = Number(req.params.id);
  if (req.user.role !== 'personal' || !(await resolveAccess(req, studentId))) return res.status(403).json({ error: 'Assessment access forbidden' });
  const { experienceLevel, anatomicalLimitations, clinicalInjuries, personalNotes, studentNotes } = req.body;
  try {
    const [id] = await db('student_assessments').insert({ student_id: studentId, personal_id: req.user.id, experience_level: experienceLevel, anatomical_limitations: anatomicalLimitations || null, clinical_injuries: clinicalInjuries || null, personal_notes: personalNotes || null, student_notes: studentNotes || null });
    const row = await db('student_assessments').where({ id }).first();
    return res.status(201).json(publicAssessment(row, true));
  } catch (error) {
    console.error('Create assessment error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { createAssessment, listAssessments };
