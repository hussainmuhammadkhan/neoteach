const express      = require('express');
const router       = express.Router();
const fetchuser    = require('../middleware/fetchUser');
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const ProfileUser  = require('../models/ProfileUser'); // ✅ direct import — model 'profile_user'
const mongoose     = require('mongoose');

// ── Avatar URL builder ────────────────────────────────
// profileRoutes stores: "uploads/avatars/avatar_123.jpg"
// Flutter needs:        "http://192.168.1.9:5000/uploads/avatars/avatar_123.jpg"
function _buildAvatarUrl(avatarPath) {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http')) return avatarPath; // already full URL
  const baseUrl = process.env.BASE_URL || 'http://10.10.16.145:5000';
  return `${baseUrl}/${avatarPath}`;
}

// ── Inject avatar into participants array ─────────────
async function _injectAvatars(participants) {
  return Promise.all(
    participants.map(async (p) => {
      const profile = await ProfileUser
        .findOne({ userId: p._id })
        .select('avatar')
        .lean();
      return {
        ...p,
        avatar: _buildAvatarUrl(profile?.avatar) || null,
      };
    })
  );
}

// ════════════════════════════════════════════════════════
// GET /api/chat/users  — list all users to start a chat
// ════════════════════════════════════════════════════════
router.get('/users', fetchuser, async (req, res) => {
  try {
    const User  = mongoose.models['user'];
    const users = await User
      .find({ _id: { $ne: req.user.id } })
      .select('name email role')
      .sort({ name: 1 })
      .lean();

    // ✅ Har user ka full avatar URL attach karo
    const usersWithAvatar = await Promise.all(
      users.map(async (u) => {
        const profile = await ProfileUser
          .findOne({ userId: u._id })
          .select('avatar')
          .lean();
        return { ...u, avatar: _buildAvatarUrl(profile?.avatar) || null };
      })
    );

    res.json({ success: true, users: usersWithAvatar });
  } catch (e) {
    console.error('GET /users error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════
// GET /api/chat/conversations — my conversations
// ════════════════════════════════════════════════════════
router.get('/conversations', fetchuser, async (req, res) => {
  try {
    const convos = await Conversation
      .find({ participants: req.user.id })
      .populate('participants', 'name email role')
      .sort({ lastMessageAt: -1 })
      .lean();

    // ✅ Participants mein avatar inject karo
    const convosWithAvatars = await Promise.all(
      convos.map(async (convo) => {
        convo.participants = await _injectAvatars(convo.participants);
        return convo;
      })
    );

    res.json({ success: true, conversations: convosWithAvatars });
  } catch (e) {
    console.error('GET /conversations error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════
// POST /api/chat/conversations — start or get conversation
// ════════════════════════════════════════════════════════
router.post('/conversations', fetchuser, async (req, res) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId) return res.status(400).json({ error: 'recipientId required' });

    const myId = req.user.id;

    let convo = await Conversation
      .findOne({ participants: { $all: [myId, recipientId], $size: 2 } })
      .populate('participants', 'name email role')
      .lean();

    if (!convo) {
      const created = await Conversation.create({ participants: [myId, recipientId] });
      convo = await Conversation
        .findById(created._id)
        .populate('participants', 'name email role')
        .lean();
    }

    // ✅ Avatar inject karo
    convo.participants = await _injectAvatars(convo.participants);

    res.json({ success: true, conversation: convo });
  } catch (e) {
    console.error('POST /conversations error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════
// GET /api/chat/messages/:conversationId — load messages
// ════════════════════════════════════════════════════════
router.get('/messages/:conversationId', fetchuser, async (req, res) => {
  try {
    const messages = await Message
      .find({ conversationId: req.params.conversationId })
      .populate('sender', 'name email role')
      .sort({ createdAt: 1 })
      .limit(100);

    // Mark as read
    await Message.updateMany(
      { conversationId: req.params.conversationId, readBy: { $ne: req.user.id } },
      { $addToSet: { readBy: req.user.id } }
    );

    res.json({ success: true, messages });
  } catch (e) {
    console.error('GET /messages error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════
// POST /api/chat/messages — send message (REST fallback)
// ════════════════════════════════════════════════════════
router.post('/messages', fetchuser, async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    if (!conversationId || !text) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const msg = await Message.create({
      conversationId,
      sender: req.user.id,
      text:   text.trim(),
      readBy: [req.user.id],
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage:   text.trim(),
      lastMessageAt: new Date(),
    });

    const populated = await msg.populate('sender', 'name email role');
    res.json({ success: true, message: populated });
  } catch (e) {
    console.error('POST /messages error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;