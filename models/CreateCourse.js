const mongoose = require('mongoose');
const { Schema } = mongoose;

const CourseSchema = new Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    keywords:    { type: [String], required: true },
    category:    { type: String, required: true },

    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: true,
    },

    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },

    // ✅ Admin: course approval status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // ✅ Premium settings (FIXED POSITION)
    isPremium: { type: Boolean, default: false },
    price:     { type: Number, default: 0 },

    // ✅ Analytics: track students who open this course
    enrolledStudents: [
      {
        student:  { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        openedAt: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
        visits:   { type: Number, default: 1 },
      }
    ],

    // ✅ Analytics: monthly view counts
    monthlyViews: [
      {
        _id:   false,
        year:  { type: Number },
        month: { type: Number },
        views: { type: Number, default: 0 },
      }
    ],

    // ✅ Analytics: total views counter
    totalViews: { type: Number, default: 0 },

    // ✅ AI Generated Content
    aiContent: {
      summary:           { type: String, default: '' },
      estimatedDuration: { type: String, default: '' },
      objectives:        { type: [String], default: [] },
      prerequisites:     { type: [String], default: [] },

      topics: [
        {
          _id:         false,
          title:       { type: String, default: '' },
          explanation: { type: String, default: '' },
        }
      ],

      quizzes: [
        {
          _id:    false,
          lesson: { type: Number, default: 0 },
          title:  { type: String, default: '' },
          questions: [
            {
              _id:      false,
              question: { type: String,   default: '' },
              options:  { type: [String], default: [] },
              answer:   { type: String,   default: '' },
            }
          ],
        }
      ],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('course', CourseSchema);