const mongoose = require('mongoose');

const ScheduleSlotSchema = new mongoose.Schema({
  day:       { type: String }, // e.g. 'Monday'
  startTime: { type: String }, // e.g. '09:00 AM'
  endTime:   { type: String }, // e.g. '05:00 PM'
  available: { type: Boolean, default: true },
}, { _id: false });

const TeacherProfileSchema = new mongoose.Schema({
  teacherId:  { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, unique: true },
  bio:        { type: String, default: '' },
  hourlyRate: { type: Number, default: 0 },
  skills:     { type: [String], default: [] },
  schedule:   { type: [ScheduleSlotSchema], default: [] },
}, { timestamps: true });

if (mongoose.models['TeacherProfile']) {
  module.exports = mongoose.models['TeacherProfile'];
} else {
  module.exports = mongoose.model('TeacherProfile', TeacherProfileSchema);
}