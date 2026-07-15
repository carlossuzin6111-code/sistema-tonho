const db = require('../database');

// In-memory mapping of active SSE clients for real-time messaging
// Key: userId (integer or string), Value: Set of express response objects
const activeClients = new Map();

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

// Get chat messages history
async function getMessages(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  let targetId = req.params.userId;

  try {
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
    const messages = await db('chat_messages')
      .where(function() {
        this.where('sender_id', userId).andWhere('receiver_id', targetId);
      })
      .orWhere(function() {
        this.where('sender_id', targetId).andWhere('receiver_id', userId);
      })
      .orderBy('created_at', 'asc');

    res.status(200).json(messages);
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

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message content cannot be empty' });
  }

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

// SSE Connection Handler for Real-Time Updates
function handleChatStream(req, res) {
  const userId = req.user.id.toString();

  // Set necessary headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Write initial blank line to establish connection
  res.write(':ok\n\n');

  // Add client to active streams
  if (!activeClients.has(userId)) {
    activeClients.set(userId, new Set());
  }
  activeClients.get(userId).add(res);

  console.log(`User ${userId} connected to real-time chat stream. Active streams: ${activeClients.get(userId).size}`);

  // Handle client disconnection
  req.on('close', () => {
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
  getMessages,
  sendMessage,
  handleChatStream
};
