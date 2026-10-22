const mongoose = require('mongoose');

// ✅ Conversation model — between 2 users (or group later)
if (mongoose.models['Conversation']) {
  module.exports = mongoose.models['Conversation'];
} else {
  const ConversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true }],
    lastMessage:  { type: String, default: '' },
    lastMessageAt:{ type: Date,   default: Date.now },
  }, { timestamps: true });

  module.exports = mongoose.model('Conversation', ConversationSchema);
}