const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/auth');
const Message = require('./models/Message');
const Group = require('./models/Group');

// Track call participants: Map<callId, Set<userId>>
const callParticipants = new Map();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all files for now to debug the issue
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Auth routes
app.use('/api/auth', authRoutes);

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileType = req.file.mimetype.startsWith('image/') ? 'image' :
                   req.file.mimetype.startsWith('video/') ? 'video' :
                   req.file.mimetype.startsWith('audio/') ? 'audio' : 'file';

  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    type: fileType,
    url: `/uploads/${req.file.filename}`
  });
});

// Get users endpoint
app.get('/api/users', async (req, res) => {
  await db.read();
  const users = db.data.users ? db.data.users.map(u => ({ id: u.id, username: u.username, avatar: u.avatar })) : [];
  res.json(users);
});

// Get groups endpoint
app.get('/api/groups', async (req, res) => {
  await db.read();
  const groups = db.data.groups ? db.data.groups.map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    avatar: g.avatar,
    members: g.members,
    creatorId: g.creatorId
  })) : [];
  res.json(groups);
});

// Create group endpoint
app.post('/api/groups', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    await db.read();
    if (!db.data.groups) db.data.groups = [];
    const groupId = Date.now().toString();
    const group = new Group(groupId, name, description, decoded.userId, [decoded.userId]);

    db.data.groups.push(group);
    await db.write();

    res.json(group.toJSON());
  });
});

// Join group endpoint
app.post('/api/groups/:groupId/join', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const { groupId } = req.params;

    await db.read();
    const groupIndex = db.data.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = db.data.groups[groupIndex];
    if (group.hasMember(decoded.userId)) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    group.addMember(decoded.userId);
    await db.write();

    res.json({ message: 'Joined group successfully' });
  });
});

// Generate group invite link
app.get('/api/groups/:groupId/invite', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const { groupId } = req.params;

    await db.read();
    const group = db.data.groups.find(g => g.id === groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!group.members.includes(decoded.userId)) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const inviteLink = `${process.env.BASE_URL || 'http://localhost:3000'}/join-group.html?groupId=${groupId}`;
    res.json({ inviteLink });
  });
});

// Get messages endpoint
app.get('/api/messages', async (req, res) => {
  await db.read();
  res.json(db.data.messages || []);
});

// Profile endpoints
app.get('/api/profile', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    await db.read();
    const user = db.data.users.find(u => u.id === decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      description: user.description,
      avatar: user.avatar
    });
  });
});

app.put('/api/profile', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const { description } = req.body;

    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === decoded.userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.data.users[userIndex].description = description;
    await db.write();

    res.json({ message: 'Profile updated successfully' });
  });
});

// Avatar upload endpoint
app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    await db.read();
    const userIndex = db.data.users.findIndex(u => u.id === decoded.userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.data.users[userIndex].avatar = avatarUrl;
    await db.write();

    res.json({ avatarUrl });
  });
});

// Middleware to verify JWT
const authenticateToken = (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.userId = decoded.userId;
    next();
  });
};

// Socket.io connection
io.use(authenticateToken);

io.on('connection', (socket) => {
  console.log('User connected:', socket.userId);

  // Load previous messages for the user
  db.read().then(() => {
    const messages = db.data.messages.filter(msg => msg.fromUserId === socket.userId || msg.toUserId === socket.userId);
    socket.emit('loadMessages', messages);
  });

  // Handle sending message
  socket.on('sendMessage', async (data) => {
    const { toUserId, toGroupId, content, attachment } = data;
    const message = new Message(socket.userId, toUserId, content, attachment, toGroupId);

    // Save to DB
    await db.read();
    db.data.messages.push(message);
    await db.write();

    // Emit to sender and receiver/group
    socket.emit('message', message);
    if (toGroupId) {
      // Group message
      await db.read();
      const group = db.data.groups.find(g => g.id === toGroupId);
      if (group) {
        group.members.forEach(memberId => {
          if (memberId !== socket.userId) {
            io.to(memberId).emit('message', message);
          }
        });
      }
    } else {
      io.to(toUserId).emit('message', message);
    }
  });

  // Handle editing message
  socket.on('editMessage', async (data) => {
    const { messageId, content } = data;

    await db.read();
    const messageIndex = db.data.messages.findIndex(msg => msg.id === messageId && msg.fromUserId === socket.userId);
    if (messageIndex !== -1) {
      db.data.messages[messageIndex].content = content;
      db.data.messages[messageIndex].edited = true;
      await db.write();

      const updatedMessage = db.data.messages[messageIndex];
      socket.emit('messageEdited', updatedMessage);
      io.to(updatedMessage.toUserId).emit('messageEdited', updatedMessage);
    }
  });

  // Handle deleting message
  socket.on('deleteMessage', async (data) => {
    const { messageId } = data;

    await db.read();
    const messageIndex = db.data.messages.findIndex(msg => msg.id === messageId && msg.fromUserId === socket.userId);
    if (messageIndex !== -1) {
      const deletedMessage = db.data.messages.splice(messageIndex, 1)[0];
      await db.write();

      socket.emit('messageDeleted', { messageId });
      io.to(deletedMessage.toUserId).emit('messageDeleted', { messageId });
    }
  });

  // Call handling (no longer needed for incomingCall, calls are initiated via messages)

  socket.on('joinCall', (data) => {
    const { callId } = data;
    socket.join(callId);
    socket.to(callId).emit('callJoined', { initiatorId: socket.userId });

    // Add participant to tracking
    if (!callParticipants.has(callId)) {
      callParticipants.set(callId, new Set());
    }
    callParticipants.get(callId).add(socket.userId);
  });

  socket.on('offer', (data) => {
    const { callId, offer } = data;
    socket.to(callId).emit('offer', { offer });
  });

  socket.on('answer', (data) => {
    const { callId, answer } = data;
    socket.to(callId).emit('answer', { answer });
  });

  socket.on('iceCandidate', (data) => {
    const { callId, candidate } = data;
    socket.to(callId).emit('iceCandidate', { candidate });
  });

  socket.on('addParticipant', async (data) => {
    const { callId, username } = data;
    await db.read();
    const user = db.data.users.find(u => u.username === username);
    if (user) {
      io.to(user.id).emit('incomingCall', {
        callId,
        fromUserId: socket.userId,
        type: 'call',
        callLink: `${process.env.BASE_URL || 'http://localhost:3000'}/call.html?callId=${callId}&type=video`
      });
      socket.emit('participantAdded', { username });
    } else {
      socket.emit('participantNotFound', { username });
    }
  });

  socket.on('endCall', (data) => {
    const { callId } = data;
    socket.to(callId).emit('callEnded');
    socket.leave(callId);

    // Remove participant from tracking
    const participants = callParticipants.get(callId);
    if (participants) {
      participants.delete(socket.userId);
      if (participants.size === 0) {
        // All participants left, update message to "Call ended"
        updateCallMessageToEnded(callId);
        callParticipants.delete(callId);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.userId);

    // Remove from all call participants
    for (const [callId, participants] of callParticipants.entries()) {
      if (participants.has(socket.userId)) {
        participants.delete(socket.userId);
        if (participants.size === 0) {
          // All participants left, update message to "Call ended"
          updateCallMessageToEnded(callId);
          callParticipants.delete(callId);
        }
      }
    }
  });
});

// Function to update call message to "Call ended"
async function updateCallMessageToEnded(callId) {
  await db.read();
  const messageIndex = db.data.messages.findIndex(msg => msg.content && msg.content.includes(callId));
  if (messageIndex !== -1) {
    const message = db.data.messages[messageIndex];
    message.content = 'Call ended';
    message.callEnded = true;
    await db.write();

    // Emit messageEdited to all relevant users
    if (message.toGroupId) {
      // Group message
      await db.read();
      const group = db.data.groups.find(g => g.id === message.toGroupId);
      if (group) {
        group.members.forEach(memberId => {
          io.to(memberId).emit('messageEdited', message);
        });
      }
    } else {
      // Direct message
      io.to(message.fromUserId).emit('messageEdited', message);
      io.to(message.toUserId).emit('messageEdited', message);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
