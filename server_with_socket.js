const connectToMongo = require('./db');
const cors           = require('cors');
const express        = require('express');
const http           = require('http');           // ✅ Socket.IO needs http server
const { Server }     = require('socket.io');      // ✅ Socket.IO
require("dotenv").config();

const app    = express();
const server = http.createServer(app);             // ✅ wrap express in http
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const port = 5000;

connectToMongo();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ Models pehle load
require('./models/User');
require('./models/CreateCourse');

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/courses',       require('./routes/create_course'));
app.use('/api/profile',       require('./routes/profileRoutes'));
app.use('/api/session',       require('./routes/session'));
app.use('/api/analytics',     require('./routes/analyticsRoutes'));
app.use('/api/quizbank',      require('./routes/quizRoutes'));
app.use('/api/chat',          require('./routes/chatRoutes'));   // ✅ NEW

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Admin routes
app.use('/api/admin',         require('./adminRoutes/admin'));
app.use('/api/users',         require('./adminRoutes/adminUsers'));
app.use('/api/admin/courses', require('./adminRoutes/manageCourses'));
app.use('/api/flags',         require('./adminRoutes/flag'));

// ════════════════════════════════════════════════════════
// ✅ SOCKET.IO — Real-time chat
// ════════════════════════════════════════════════════════
const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // User joins with their userId
  socket.on('user:join', (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.join(userId);  // personal room
    //console.log(`✅ User ${userId} online`);
    io.emit('users:online', Array.from(onlineUsers.keys()));
  });

  // Join a conversation room
  socket.on('conversation:join', (conversationId) => {
    socket.join(conversationId);
    //console.log(`📩 Joined conversation: ${conversationId}`);
  });

  // Send message via socket
  socket.on('message:send', async (data) => {
    try {
      const Message      = require('./models/Message');
      const Conversation = require('./models/Conversation');

      const msg = await Message.create({
        conversationId: data.conversationId,
        sender:         data.senderId,
        text:           data.text.trim(),
        readBy:         [data.senderId],
      });

      await Conversation.findByIdAndUpdate(data.conversationId, {
        lastMessage:   data.text.trim(),
        lastMessageAt: new Date(),
      });

      const populated = await msg.populate('sender', 'name email role');

      // ✅ Emit to all in conversation room
      io.to(data.conversationId).emit('message:new', populated);
      //console.log(`💬 Message sent in ${data.conversationId}`);
    } catch (e) {
      console.error('❌ Socket message error:', e.message);
      socket.emit('message:error', { error: e.message });
    }
  });

  // Typing indicators
  socket.on('typing:start', (data) => {
    socket.to(data.conversationId).emit('typing:start', { userId: data.userId });
  });

  socket.on('typing:stop', (data) => {
    socket.to(data.conversationId).emit('typing:stop', { userId: data.userId });
  });

  socket.on('disconnect', () => {
    onlineUsers.forEach((sId, uId) => {
      if (sId === socket.id) onlineUsers.delete(uId);
    });
    io.emit('users:online', Array.from(onlineUsers.keys()));
    console.log('❌ Socket disconnected:', socket.id);
  });
});

// ✅ server.listen instead of app.listen
server.listen(5000, '0.0.0.0', () => {
  console.log('Server running at http://localhost:' + port);
});