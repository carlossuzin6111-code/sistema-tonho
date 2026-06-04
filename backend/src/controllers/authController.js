const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

const fs = require('fs');
const path = require('path');

async function registerPersonal(req, res) {
  const { name, email, password, accessKey } = req.body;

  if (!name || !email || !password || !accessKey) {
    return res.status(400).json({ error: 'Name, email, password, and accessKey are required' });
  }

  // Validate Access Key
  const keysPath = path.join(__dirname, '../../keys_aut.json');
  try {
    const keysData = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    if (!keysData.valid_keys.includes(accessKey)) {
      return res.status(403).json({ error: 'Access Key Inválida' });
    }
    // Consume the key
    keysData.valid_keys = keysData.valid_keys.filter(k => k !== accessKey);
    fs.writeFileSync(keysPath, JSON.stringify(keysData, null, 2));
  } catch (err) {
    console.error('Error reading/writing keys:', err.message);
    return res.status(500).json({ error: 'Erro ao verificar chaves de acesso' });
  }

  try {
    // Check if email already exists
    const existingUser = await db('users').select('id').where('email', email).first();
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const [insertedId] = await db('users').insert({
      name,
      email,
      password_hash: passwordHash,
      role: 'personal'
    });

    // Generate token
    const token = jwt.sign(
      { id: result.id, name, email, role: 'personal' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Personal Trainer registered successfully',
      token,
      user: { id: insertedId, name, email, role: 'personal' }
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user
    const user = await db('users').where('email', email).first();
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getMe(req, res) {
  try {
    const user = await db('users')
      .select('id', 'name', 'email', 'role', 'created_at')
      .where('id', req.user.id)
      .first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error('getMe error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  registerPersonal,
  login,
  getMe
};
