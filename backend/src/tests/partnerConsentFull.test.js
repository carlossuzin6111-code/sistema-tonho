process.env.NODE_ENV = 'test';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const partnerController = require('../controllers/partnerController');
const db = require('../database');

describe('Full Partner Consent API Lifecycle (OPS-03)', () => {
  let studentId;
  let partnerId;
  let consentId;

  before(async () => {
    await db.ready;
    // Create test student user
    const [sId] = await db('users').insert({
      name: 'Consent Test Student',
      email: 'student_consent_test@example.com',
      password_hash: 'hash',
      role: 'student'
    });
    studentId = sId;

    // Create test partner user & profile
    const [pUserId] = await db('users').insert({
      name: 'Dr. Silva Nutri',
      email: 'dr_silva_nutri@example.com',
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

  after(async () => {
    await db('student_partner_consents').where({ student_id: studentId }).del();
    await db('professional_partners').where({ id: partnerId }).del();
    await db('users').whereIn('id', [studentId]).del();
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
    assert.equal(Array.isArray(jsonResult), true);
    const found = jsonResult.find(p => p.id === partnerId);
    assert.ok(found);
    assert.equal(found.name, 'Dr. Silva Nutri');
    assert.equal(found.specialty, 'Nutrição Esportiva');
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
    assert.ok([200, 201].includes(statusCode));
    assert.equal(jsonResult.partnerId, partnerId);
    assert.deepEqual(jsonResult.scopes, ['workout_logs', 'measurements']);
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
    assert.equal(Array.isArray(jsonResult), true);
    const found = jsonResult.find(c => c.partnerId === partnerId);
    assert.ok(found);
    assert.equal(found.partnerName, 'Dr. Silva Nutri');
    assert.equal(found.status, 'active');
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
    assert.equal(jsonResult.message, 'Partner consent revoked');
  });
});
