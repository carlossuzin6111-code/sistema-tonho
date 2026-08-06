process.env.NODE_ENV = 'test';

const partnerController = require('../controllers/partnerController');
const db = require('../database');

describe('Full Partner Consent API Lifecycle (OPS-03)', () => {
  let studentId;
  let partnerId;
  let consentId;

  beforeAll(async () => {
    await db.ready;
    // Create test student user
    const [sId] = await db('users').insert({
      name: 'Consent Test Student',
      email: `student_consent_${Date.now()}@example.com`,
      password_hash: 'hash',
      role: 'student'
    });
    studentId = sId;

    // Create test partner user & profile
    const [pUserId] = await db('users').insert({
      name: 'Dr. Silva Nutri',
      email: `dr_silva_${Date.now()}@example.com`,
      password_hash: 'hash',
      role: 'partner'
    });

    const [pId] = await db('professional_partners').insert({
      user_id: pUserId,
      specialty: 'Nutrição Esportiva',
      organization: 'Clínica HealthLife',
      status: 'active'
    });
    partnerId = pId;
  });

  afterAll(async () => {
    if (studentId) {
      await db('student_partner_consents').where({ student_id: studentId }).del();
      await db('users').where({ id: studentId }).del();
    }
    if (partnerId) {
      const partner = await db('professional_partners').where({ id: partnerId }).first();
      await db('professional_partners').where({ id: partnerId }).del();
      if (partner) await db('users').where({ id: partner.user_id }).del();
    }
    await db.destroy();
  });

  test('listAvailablePartners returns active partners', async () => {
    const req = { user: { id: studentId, role: 'student' } };
    let jsonResult;
    const res = {
      json: data => { jsonResult = data; return data; },
      status: code => res
    };

    await partnerController.listAvailablePartners(req, res);
    expect(Array.isArray(jsonResult)).toBe(true);
    const found = jsonResult.find(p => p.id === partnerId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Dr. Silva Nutri');
    expect(found.specialty).toBe('Nutrição Esportiva');
  });

  test('createConsent grants consent to active partner', async () => {
    const req = {
      user: { id: studentId, role: 'student' },
      body: { partnerId, scopes: ['workout_logs', 'measurements'] }
    };
    let statusCode = 200;
    let jsonResult;
    const res = {
      status: code => { statusCode = code; return res; },
      json: data => { jsonResult = data; return data; }
    };

    await partnerController.createConsent(req, res);
    expect([200, 201]).toContain(statusCode);
    expect(jsonResult.partnerId).toBe(partnerId);
    expect(jsonResult.scopes).toEqual(['workout_logs', 'measurements']);
    consentId = jsonResult.consentId;
  });

  test('listConsents lists granted consents for student', async () => {
    const req = { user: { id: studentId, role: 'student' } };
    let jsonResult;
    const res = {
      json: data => { jsonResult = data; return data; },
      status: code => res
    };

    await partnerController.listConsents(req, res);
    expect(Array.isArray(jsonResult)).toBe(true);
    const found = jsonResult.find(c => c.partnerId === partnerId);
    expect(found).toBeDefined();
    expect(found.partnerName).toBe('Dr. Silva Nutri');
    expect(found.status).toBe('active');
  });

  test('revokeConsent revokes active partner consent', async () => {
    const req = {
      user: { id: studentId, role: 'student' },
      params: { id: consentId }
    };
    let jsonResult;
    const res = {
      json: data => { jsonResult = data; return data; },
      status: code => res
    };

    await partnerController.revokeConsent(req, res);
    expect(jsonResult.message).toBe('Partner consent revoked');
  });
});
