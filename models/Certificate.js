const mongoose = require('mongoose');

const CertificateSchema = new mongoose.Schema({
  // ── Unique human-readable code e.g. NEO-A1B2 ──────────
  certificateCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },

  // ── Student ───────────────────────────────────────────
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  studentName: { type: String, required: true },

  // ── Quiz Bank / Course ────────────────────────────────
  quizBank: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuizModel',
    required: true,
  },
  courseName: { type: String, required: true },

  // ── Score & Grade ─────────────────────────────────────
  averageScore: { type: Number, required: true }, // 0-100
  performanceLevel: {
    type: String,
    enum: ['Pass', 'Excellent', 'Distinction'],
    required: true,
  },

  // ── AI-generated body text ────────────────────────────
  aiGeneratedText: { type: String, default: '' },

  // ── PDF path on disk ──────────────────────────────────
  pdfPath: { type: String, default: '' },

  // ── Dates ─────────────────────────────────────────────
  completionDate: { type: Date, default: Date.now },
  issuedAt:       { type: Date, default: Date.now },

  // ── Status ────────────────────────────────────────────
  isValid: { type: Boolean, default: true },
}, { timestamps: true });

// ── Prevent duplicate: one cert per student+quizBank ──
CertificateSchema.index({ student: 1, quizBank: 1 }, { unique: true });

module.exports = mongoose.model('Certificate', CertificateSchema);