const db = require('../database');
const { recordAudit } = require('../services/auditService');

function numericCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = value => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function createGeofence(req, res) {
  if (req.user.role !== 'personal') return res.status(403).json({ error: 'Personal role required' });
  const name = String(req.body.name || '').trim().slice(0, 120);
  const latitude = numericCoordinate(req.body.latitude, -90, 90);
  const longitude = numericCoordinate(req.body.longitude, -180, 180);
  const radiusMeters = Number(req.body.radiusMeters || 150);
  if (!name || latitude === null || longitude === null || !Number.isInteger(radiusMeters) || radiusMeters < 20 || radiusMeters > 10000) return res.status(400).json({ error: 'name, coordinates and radiusMeters (20..10000) are required' });
  const [id] = await db('gym_geofences').insert({ personal_id: req.user.id, name, latitude, longitude, radius_meters: radiusMeters, active: true });
  return res.status(201).json({ id, name, latitude, longitude, radiusMeters, active: true });
}

async function listGeofences(req, res) {
  if (req.user.role !== 'personal') return res.status(403).json({ error: 'Personal role required' });
  const rows = await db('gym_geofences').where({ personal_id: req.user.id }).select('id', 'name', 'latitude', 'longitude', 'radius_meters as radiusMeters', 'active').orderBy('name');
  return res.json(rows);
}

async function checkIn(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student role required' });
  const geofenceId = Number(req.body.geofenceId);
  const latitude = numericCoordinate(req.body.latitude, -90, 90);
  const longitude = numericCoordinate(req.body.longitude, -180, 180);
  const clientEventId = String(req.body.clientEventId || '').slice(0, 160);
  if (!Number.isInteger(geofenceId) || latitude === null || longitude === null || !clientEventId) return res.status(400).json({ error: 'geofenceId, coordinates and clientEventId are required' });
  try {
    const profile = await db('student_profiles').where({ student_id: req.user.id }).first();
    if (!profile) return res.status(403).json({ error: 'Student has no active Personal relationship' });
    const geofence = await db('gym_geofences').where({ id: geofenceId, personal_id: profile.personal_id, active: 1 }).first();
    if (!geofence) return res.status(404).json({ error: 'Active geofence not found' });
    const distance = distanceMeters(latitude, longitude, geofence.latitude, geofence.longitude);
    if (distance > geofence.radius_meters) return res.status(422).json({ error: 'Student is outside the geofence', distanceMeters: distance, radiusMeters: geofence.radius_meters });
    const existing = await db('student_checkins').where({ student_id: req.user.id, client_event_id: clientEventId }).first();
    if (existing) return res.status(200).json({ id: existing.id, status: existing.status, duplicate: true });
    const [id] = await db('student_checkins').insert({ student_id: req.user.id, personal_id: profile.personal_id, geofence_id: geofence.id, client_event_id: clientEventId, latitude, longitude, distance_meters: distance, status: 'active' });
    await recordAudit(db, { actorUserId: req.user.id, action: 'checkin.created', targetType: 'student_checkin', targetId: id, metadata: { geofenceId: geofence.id, distanceMeters: distance } });
    return res.status(201).json({ id, status: 'active', distanceMeters: distance, geofenceId: geofence.id });
  } catch (error) {
    console.error('Student check-in error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function checkOut(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student role required' });
  const updated = await db('student_checkins').where({ id: req.params.id, student_id: req.user.id, status: 'active' }).update({ status: 'completed', checked_out_at: db.fn.now(), updated_at: db.fn.now() });
  return updated ? res.json({ message: 'Check-in completed' }) : res.status(404).json({ error: 'Active check-in not found' });
}

async function listCheckins(req, res) {
  if (req.user.role !== 'personal') return res.status(403).json({ error: 'Personal role required' });
  const query = db('student_checkins as c').join('users as u', 'u.id', 'c.student_id').where('c.personal_id', req.user.id).select('c.id', 'c.student_id as studentId', 'u.name as studentName', 'c.geofence_id as geofenceId', 'c.status', 'c.distance_meters as distanceMeters', 'c.checked_in_at as checkedInAt', 'c.checked_out_at as checkedOutAt').orderBy('c.checked_in_at', 'desc').limit(200);
  if (req.query.studentId) query.andWhere('c.student_id', Number(req.query.studentId));
  return res.json(await query);
}

module.exports = { createGeofence, listGeofences, checkIn, checkOut, listCheckins, distanceMeters };
