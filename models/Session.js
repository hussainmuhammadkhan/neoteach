const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  teacherId:        { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  teacherName:      { type: String, required: true },
  studentId:        { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  sessionType:      { type: String, enum: ['video', 'chat'], required: true },
  date:             { type: Date,   required: true },
  time:             { type: String, required: true },
  notes:            { type: String, default: '' },
  hourlyRate:       { type: Number, default: 0 },
  status:           { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  notificationRead: { type: Boolean, default: true }, // false = unread notification
}, { timestamps: true });

if (mongoose.models['Session']) {
  module.exports = mongoose.models['Session'];
} else {
  module.exports = mongoose.model('Session', SessionSchema);
}