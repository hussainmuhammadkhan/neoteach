const mongoose = require('mongoose');

// ✅ Updated Message model — file/image support added
if (mongoose.models['Message']) {
  module.exports = mongoose.models['Message'];
} else {
  const MessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender:         { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    text:           { type: String, trim: true, default: '' },
    readBy:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],

    // ── File / Image fields (optional) ──────────────
    fileUrl:  { type: String, default: null },  // uploaded file public URL
    fileType: { type: String, enum: ['image', 'file', null], default: null },
    fileName: { type: String, default: null },  // original file name
    fileSize: { type: String, default: null },  // e.g. "2.3 MB"

  }, { timestamps: true });

  module.exports = mongoose.model('Message', MessageSchema);
}