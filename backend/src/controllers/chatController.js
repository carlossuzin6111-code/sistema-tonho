const db = require('../database');

// In-memory mapping of active SSE clients for real-time messaging
// Key: userId (integer or string), Value: Set of express response objects
const activeClients = new Map();
const SSE_HEARTBEAT_INTERVAL_MS = 25_000;
const typingLastSent = new Map();
const typingTimers = new Map();

async function getChatPartner(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Chat partner is available to students only' });
  try {
    const partner = await db('student_profiles as sp')
      .join('users as u', 'u.id', 'sp.personal_id')
      .select('u.id', 'u.name', 'u.avatar_filename', 'u.avatar_updated_at')
      .where('sp.student_id', req.user.id)
      .first();
    if (!partner) return res.status(404).json({ error: 'Personal Trainer profile not found' });
    return res.json({
      id: partner.id,
      name: partner.name,
      hasAvatar: Boolean(partner.avatar_filename),
      avatarUpdatedAt: partner.avatar_updated_at || null
    });
  } catch (error) {
    console.error('Get chat partner error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper to send real-time event to a user if connected
function notifyUser(userId, data) {
  const userStreams = activeClients.get(userId.toString());
  if (userStreams) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of userStreams) {
      try {
        res.write(payload);
      } catch (err) {
        console.error(`Error writing to SSE stream for user ${userId}:`, err.message);
      }
    }
  }
}

function notifyTyping(userId, data) {
  const streams = activeClients.get(userId.toString());
  if (!streams) return;
  const payload = `event: typing\ndata: ${JSON.stringify(data)}\n\n`;
  for (const stream of streams) {
    try { stream.write(payload); } catch (error) { console.error('Typing SSE error:', error.message); }
  }
}

async function sendTyping(req, res) {
  const senderId = req.user.id;
  let { receiverId, isTyping = true } = req.body || {};
  try {
    if (req.user.role === 'student') {
      const profile = await db('student_profiles').select('personal_id').where({ student_id: senderId }).first();
      if (!profile) return res.status(400).json({ error: 'No Personal Trainer linked to this student' });
      receiverId = profile.personal_id;
    } else if (req.user.role === 'personal') {
      receiverId = Number(receiverId);
      const linked = await db('student_profiles').where({ student_id: receiverId, personal_id: senderId }).first();
      if (!linked) return res.status(403).json({ error: 'Chat access forbidden' });
    } else return res.status(403).json({ error: 'Chat access forbidden' });
    const key = `${senderId}:${receiverId}`;
    const now = Date.now();
    if (isTyping && now - (typingLastSent.get(key) || 0) < 400) return res.status(204).send();
    typingLastSent.set(key, now);
    clearTimeout(typingTimers.get(key));
    notifyTyping(receiverId, { userId: senderId, isTyping: Boolean(isTyping) });
    if (isTyping) typingTimers.set(key, setTimeout(() => {
      notifyTyping(receiverId, { userId: senderId, isTyping: false });
      typingTimers.delete(key);
    }, 1500));
    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error('Typing notification error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Get chat messages history
async function getMessages(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  let targetId = req.params.userId;

  try {
    const hasPagination = req.query.before !== undefined || req.query.limit !== undefined;
    const rawLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    const rawBefore = req.query.before === undefined ? null : Number(req.query.before);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
      return res.status(400).json({ error: 'limit must be an integer between 1 and 50' });
    }
    if (rawBefore !== null && (!Number.isInteger(rawBefore) || rawBefore < 1)) {
      return res.status(400).json({ error: 'before must be a positive integer message id' });
    }
    // Students can only chat with their linked Personal Trainer.
    if (userRole === 'student') {
      const profile = await db('student_profiles')
        .select('personal_id')
        .where('student_id', userId)
        .first();
      if (!profile) {
        return res.status(404).json({ error: 'Personal Trainer profile not found' });
      }
      targetId = profile.personal_id;
    } else if (userRole === 'personal') {
      if (!targetId) {
        return res.status(400).json({ error: 'Target User ID is required' });
      }

      const profile = await db('student_profiles')
        .select('student_id')
        .where({ student_id: targetId, personal_id: userId })
        .first();
      if (!profile) {
        return res.status(403).json({ error: 'Chat access forbidden' });
      }
    } else {
      return res.status(403).json({ error: 'Chat access forbidden' });
    }

    // Mark messages sent by target to me as read
    await db('chat_messages')
      .where({ sender_id: targetId, receiver_id: userId, read_status: 0 })
      .update({ read_status: 1 });

    // Fetch chat history between current user and target user
    const query = db('chat_messages')
      .where(function() {
        this.where('sender_id', userId).andWhere('receiver_id', targetId);
      })
      .orWhere(function() {
        this.where('sender_id', targetId).andWhere('receiver_id', userId);
      });
    if (rawBefore !== null) query.andWhere('id', '<', rawBefore);
    const rows = hasPagination
      ? await query.orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(rawLimit + 1)
      : await query.orderBy([{ column: 'created_at', order: 'asc' }, { column: 'id', order: 'asc' }]);

    const visibleRows = rows.map(row => row.deleted_at ? { ...row, message: null } : row);
    if (!hasPagination) return res.status(200).json(visibleRows);
    const hasMore = visibleRows.length > rawLimit;
    const messages = visibleRows.slice(0, rawLimit).reverse();
    return res.status(200).json({
      messages,
      nextCursor: hasMore && messages.length ? String(messages[0].id) : null
    });
  } catch (err) {
    console.error('Get messages error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Send a message
async function sendMessage(req, res) {
  const senderId = req.user.id;
  const userRole = req.user.role;
  let { receiverId, message } = req.body;

  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Message content cannot be empty' });
  }
  message = message.trim();
  if (message.length > 2000) return res.status(400).json({ error: 'Message content must be at most 2000 characters' });

  try {
    // If student, resolve their Personal Trainer ID
    if (userRole === 'student') {
      const profile = await db('student_profiles').select('personal_id').where('student_id', senderId).first();
      if (!profile) {
        return res.status(400).json({ error: 'No Personal Trainer linked to this student' });
      }
      receiverId = profile.personal_id;
    } else if (userRole === 'personal') {
      if (!receiverId) {
        return res.status(400).json({ error: 'Receiver ID is required' });
      }

      const profile = await db('student_profiles')
        .select('student_id')
        .where({ student_id: receiverId, personal_id: senderId })
        .first();
      if (!profile) {
        return res.status(403).json({ error: 'Chat access forbidden' });
      }
    } else {
      return res.status(403).json({ error: 'Chat access forbidden' });
    }

    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver ID is required' });
    }

    // Insert message into database
    const [insertedId] = await db('chat_messages').insert({
      sender_id: senderId,
      receiver_id: receiverId,
      message
    });

    const newMessage = {
      id: insertedId,
      sender_id: senderId,
      receiver_id: receiverId,
      message,
      created_at: new Date().toISOString(),
      read_status: 0
    };

    // Notify receiver and sender (for multiple tabs sync) in real-time via SSE
    notifyUser(receiverId, newMessage);
    notifyUser(senderId, newMessage);

    res.status(201).json(newMessage);
  } catch (err) {
    console.error('Send message error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getOwnedMessage(req, messageId) {
  const message = await db('chat_messages').where('id', messageId).first();
  if (!message || Number(message.sender_id) !== Number(req.user.id)) return null;
  return message;
}

async function editMessage(req, res) {
  const messageId = Number(req.params.messageId);
  const messageText = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Invalid message id' });
  if (!messageText) return res.status(400).json({ error: 'Message content cannot be empty' });
  if (messageText.length > 2000) return res.status(400).json({ error: 'Message content must be at most 2000 characters' });
  try {
    const current = await getOwnedMessage(req, messageId);
    if (!current) return res.status(404).json({ error: 'Message not found' });
    if (current.deleted_at) return res.status(409).json({ error: 'Deleted messages cannot be edited' });
    const editedAt = new Date().toISOString();
    await db('chat_messages').where({ id: messageId, sender_id: req.user.id }).update({ message: messageText, edited_at: editedAt });
    const updated = { ...current, message: messageText, edited_at: editedAt };
    notifyUser(current.sender_id, { type: 'message.updated', ...updated });
    notifyUser(current.receiver_id, { type: 'message.updated', ...updated });
    return res.json(updated);
  } catch (error) {
    console.error('Edit message error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteMessage(req, res) {
  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'Invalid message id' });
  try {
    const current = await getOwnedMessage(req, messageId);
    if (!current) return res.status(404).json({ error: 'Message not found' });
    if (current.deleted_at) return res.json({ id: messageId, deleted_at: current.deleted_at });
    const deletedAt = new Date().toISOString();
    await db('chat_messages').where({ id: messageId, sender_id: req.user.id }).update({ message: '', deleted_at: deletedAt });
    const event = { type: 'message.deleted', id: messageId, sender_id: current.sender_id, receiver_id: current.receiver_id, deleted_at: deletedAt };
    notifyUser(current.sender_id, event);
    notifyUser(current.receiver_id, event);
    return res.json({ id: messageId, deleted_at: deletedAt });
  } catch (error) {
    console.error('Delete message error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// SSE Connection Handler for Real-Time Updates
function handleChatStream(req, res) {
  const userId = req.user.id.toString();

  // Set necessary headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Write initial blank line to establish connection
  res.write(':ok\n\n');

  // Keep idle streams active across reverse proxies. SSE comments are ignored
  // by EventSource clients but count as upstream activity for proxy timeouts.
  const heartbeatTimer = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(':heartbeat\n\n');
    }
  }, SSE_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  // Add client to active streams
  if (!activeClients.has(userId)) {
    activeClients.set(userId, new Set());
  }
  activeClients.get(userId).add(res);

  console.log(`User ${userId} connected to real-time chat stream. Active streams: ${activeClients.get(userId).size}`);

  // Handle client disconnection
  req.on('close', () => {
    clearInterval(heartbeatTimer);
    const userStreams = activeClients.get(userId);
    if (userStreams) {
      userStreams.delete(res);
      if (userStreams.size === 0) {
        activeClients.delete(userId);
      }
    }
    console.log(`User ${userId} disconnected from chat stream.`);
  });
}

module.exports = {
  getChatPartner,
  getMessages,
  sendMessage,
  sendTyping,
  editMessage,
  deleteMessage,
  handleChatStream
};
