const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const { normalizeEmail } = require('../services/userIdentityService');

function optionalString({ min = 0, max, pattern, label = 'value' } = {}) {
  return value => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') return `${label} must be a string`;
    if (value.length < min) return `${label} must have at least ${min} characters`;
    if (max && value.length > max) return `${label} must have at most ${max} characters`;
    if (pattern && !pattern.test(value)) return `${label} has an invalid format`;
    return null;
  };
}

function optionalNumber({ min, max, label = 'value' } = {}) {
  return value => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} must be a finite number`;
    if (min !== undefined && value < min) return `${label} must be at least ${min}`;
    if (max !== undefined && value > max) return `${label} must be at most ${max}`;
    return null;
  };
}

function optionalPositiveInteger(label = 'value') {
  return value => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (!Number.isInteger(parsed) || parsed < 1) return `${label} must be a positive integer`;
    return null;
  };
}

function optionalExercises(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return 'exercises must be an array';
  if (value.length > 50) return 'exercises must contain at most 50 items';

  for (const exercise of value) {
    if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise)) {
      return 'each exercise must be an object';
    }
    if (typeof exercise.name === 'string' && exercise.name.length > 200) {
      return 'exercise name must have at most 200 characters';
    }
  }
  return null;
}

const text = (label, max, min = 0) => optionalString({ label, max, min });
const email = optionalString({ label: 'email', max: 254, pattern: EMAIL_PATTERN });
const password = optionalString({ label: 'password', min: 10, max: 128 });
const bodySchemas = {
  register: {
    name: text('name', 100),
    email,
    password,
    accessKey: text('accessKey', 256)
  },
  login: {
    email,
    password: text('password', 128)
  },
  student: {
    name: text('name', 100),
    email,
    password,
    height: optionalNumber({ label: 'height', min: 0.5, max: 3 }),
    targetWeight: optionalNumber({ label: 'targetWeight', min: 1, max: 1000 }),
    birthDate: optionalString({ label: 'birthDate', max: 10, pattern: DATE_PATTERN })
  },
  passwordReset: {
    newPassword: optionalString({ label: 'newPassword', min: 10, max: 128 })
  },
  measurement: {
    studentId: optionalPositiveInteger('studentId'),
    weight: optionalNumber({ label: 'weight', min: 1, max: 1000 }),
    chest: optionalNumber({ label: 'chest', min: 0, max: 1000 }),
    waist: optionalNumber({ label: 'waist', min: 0, max: 1000 }),
    hips: optionalNumber({ label: 'hips', min: 0, max: 1000 }),
    bicepsL: optionalNumber({ label: 'bicepsL', min: 0, max: 1000 }),
    bicepsR: optionalNumber({ label: 'bicepsR', min: 0, max: 1000 }),
    thighL: optionalNumber({ label: 'thighL', min: 0, max: 1000 }),
    thighR: optionalNumber({ label: 'thighR', min: 0, max: 1000 })
  },
  workout: {
    studentId: optionalPositiveInteger('studentId'),
    name: text('name', 200),
    description: text('description', 5000),
    exercises: optionalExercises
  },
  workoutExercise: {
    name: text('name', 200),
    sets: optionalPositiveInteger('sets'),
    reps: text('reps', 50),
    weight: text('weight', 50),
    restTime: text('restTime', 50),
    notes: text('notes', 2000),
    exerciseId: optionalPositiveInteger('exerciseId')
  },
  catalogExercise: {
    name: text('name', 200),
    gifUrl: text('gifUrl', 2_000_000),
    description: text('description', 5000)
  },
  chatMessage: {
    receiverId: optionalPositiveInteger('receiverId'),
    message: text('message', 2000)
  }
};

function validateBody(schemaName) {
  const schema = bodySchemas[schemaName];
  if (!schema) throw new Error(`Unknown validation schema: ${schemaName}`);

  return (req, res, next) => {
    if (req.body === undefined || req.body === null) return next();
    if (typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    if (Object.hasOwn(schema, 'email') && typeof req.body.email === 'string') {
      req.body.email = normalizeEmail(req.body.email);
    }

    const details = [];
    for (const [field, validator] of Object.entries(schema)) {
      const message = validator(req.body[field]);
      if (message) details.push({ field, message });
    }

    if (details.length > 0) {
      return res.status(400).json({ error: 'Invalid request data', details });
    }
    return next();
  };
}

function validateIdParam(paramName = 'id') {
  const validator = optionalPositiveInteger(paramName);
  return (req, res, next) => {
    const message = validator(req.params[paramName]);
    if (message) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: [{ field: paramName, message }]
      });
    }
    return next();
  };
}

module.exports = {
  bodySchemas,
  validateBody,
  validateIdParam
};
