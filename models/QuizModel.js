const mongoose = require('mongoose');
const { Schema } = mongoose;

const QuestionSchema = new Schema({
  question:    { type: String, required: true },
  options:     { type: [String], required: true },
  answer:      { type: String,  required: true },
  explanation: { type: String,  default: '' },
}, { _id: false });

const QuizSchema = new Schema({
  title:      { type: String, required: true },
  quizNumber: { type: Number, required: true },
  objectives: { type: [String], default: [] },
  questions:  { type: [QuestionSchema], default: [] },
}, { _id: false });

const AssignmentSchema = new Schema({
  title:        { type: String, required: true },
  type:         { type: String, enum: ['assignment', 'case_study'], default: 'assignment' },
  description:  { type: String, required: true },
  scenario:     { type: String, default: '' },       // ✅ ADD
  questions:    { type: [String], default: [] },     // ✅ ADD
  instructions: { type: [String], default: [] },
  rubric:       { type: String, default: '' },
  modelAnswer:  { type: String, default: '' },
  dueInDays:    { type: Number, default: 7 },
}, { _id: false });

const QuizBankSchema = new Schema({
  courseName:  { type: String, required: true, trim: true },
  courseLevel: { type: String, default: 'Intermediate' },
  category:    { type: String, default: '' },
  topicHints:  { type: String, default: '' }, // teacher provided hints
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'user',
    required: true,
  },
  quizzes:     [QuizSchema],
  assignments: [AssignmentSchema],

  attempts: [{
    student:     { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    quizIndex:   { type: Number },
    score:       { type: Number },
    answers:     { type: [String], default: [] },
    completedAt: { type: Date, default: Date.now },
    _id: false,
  }],

  assignmentSubmissions: [{
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  assignIndex: { type: Number },
  mcqAnswers:  { type: [String], default: [] },
  textAnswer:  { type: String, default: '' },
  score:       { type: Number, default: 0 },
  type:        { type: String, enum: ['assignment', 'case_study'], default: 'assignment' }, // ← ADD
  submittedAt: { type: Date, default: Date.now },
  _id: false,
}],
}, { timestamps: true });

module.exports = mongoose.model('quizbank', QuizBankSchema);