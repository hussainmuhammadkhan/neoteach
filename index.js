const connectToMongo = require('./db');
const cors           = require('cors');
const express        = require('express');
const http           = require('http');
const path           = require('path');
const { Server }     = require('socket.io');
require("dotenv").config();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const port = 5000;
connectToMongo();

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

require('./models/User');
require('./models/CreateCourse');

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/courses',       require('./routes/create_course'));
app.use('/api/profile',       require('./routes/profileRoutes'));
app.use('/api/chat',          require('./routes/chatRoutes'));
app.use('/api/chat',          require('./routes/chatFileUpload'));   // ✅ file upload route
app.use('/api/badges',        require('./routes/badgeRoutes'));
app.use('/api/progress',      require('./routes/progressRoutes'));

const certificateRouter = require('./routes/certificates');
app.use('/api/certificates',  certificateRouter);

app.use('/api/assignments',   require('./routes/assignmentRoutes'));
app.use('/api/videos',        require('./routes/videoRoutes'));
app.use('/api/payments',      require('./routes/paymentRoutes'));

// ── Static file serving ───────────────────────────────
// ✅ Specific path PEHLE — specific se generic ki taraf
app.use('/uploads/chat', express.static(path.join(__dirname, 'uploads/chat')));
app.use('/uploads',      express.static(path.join(__dirname, 'uploads')));
app.use('/certificates', express.static(path.join(__dirname, 'public/certificates')));

app.use('/api/session',         require('./routes/sessionRoutes'));
app.use('/api/teacher-profile', require('./routes/teacherProfileRoutes'));
app.use('/api/analytics',       require('./routes/analyticsRoutes'));
app.use('/api/quizbank',        require('./routes/quizRoutes'));
app.use("/api/admin",           require("./adminRoutes/admin"));
app.use("/api/users",           require("./adminRoutes/adminUsers"));
app.use("/api/admin/courses",   require("./adminRoutes/manageCourses"));
app.use("/api/flags",           require("./adminRoutes/flag"));

// ════════════════════════════════════════════════════
// Socket.IO
// ════════════════════════════════════════════════════
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('user:join', (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.join(userId);
    console.log(`✅ user:join — userId: ${userId}`);
    io.emit('users:online', Array.from(onlineUsers.keys()));
  });

  socket.on('conversation:join', (conversationId) => {
    socket.join(conversationId);
    console.log(`📩 conversation:join — room: ${conversationId} socket: ${socket.id}`);
  });

  socket.on('message:send', async (data) => {
    console.log('💬 message:send received:', data);
    try {
      // ── Validation ──────────────────────────────────
      if (!data.senderId || data.senderId.toString().trim() === '') {
        socket.emit('message:error', { error: 'senderId is required' });
        return;
      }
      if (!data.conversationId || data.conversationId.toString().trim() === '') {
        socket.emit('message:error', { error: 'conversationId is required' });
        return;
      }

      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(data.senderId)) {
        console.error('❌ Invalid senderId:', data.senderId);
        socket.emit('message:error', { error: 'Invalid senderId' });
        return;
      }

      const Message      = require('./models/Message');
      const Conversation = require('./models/Conversation');

      // ── Create message (with optional file fields) ──
      const msgData = {
        conversationId: data.conversationId,
        sender:         data.senderId,
        text:           (data.text || '').trim(),
        readBy:         [data.senderId],
      };

      if (data.fileUrl)  msgData.fileUrl  = data.fileUrl;
      if (data.fileType) msgData.fileType = data.fileType;
      if (data.fileName) msgData.fileName = data.fileName;
      if (data.fileSize) msgData.fileSize = data.fileSize;

      const msg = await Message.create(msgData);

      // ── Update conversation last message preview ────
      const lastMsgText = data.fileType === 'image'
        ? '📷 Image'
        : data.fileType === 'file'
          ? `📎 ${data.fileName || 'File'}`
          : (data.text || '').trim();

      await Conversation.findByIdAndUpdate(data.conversationId, {
        lastMessage:   lastMsgText,
        lastMessageAt: new Date(),
      });

      const populated = await msg.populate('sender', 'name email role');
      console.log(`📤 Emitting message:new to room ${data.conversationId}`);
      io.to(data.conversationId).emit('message:new', populated.toObject());

    } catch (e) {
      console.error('❌ message:send error:', e.message);
      socket.emit('message:error', { error: e.message });
    }
  });

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

server.listen(5000, '0.0.0.0', () => {
  console.log('🚀 Server running at http://localhost:' + port);
});