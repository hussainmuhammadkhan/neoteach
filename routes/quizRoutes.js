const express   = require('express');
const router    = express.Router();
const fetchuser = require('../middleware/fetchUser');
const roleCheck = require('../middleware/roleCheck');
const QuizBank  = require('../models/QuizModel');

// POST /api/quizbank/create
router.post('/create', fetchuser, roleCheck(['teacher']), async (req, res) => {
  try {
    const { courseName, courseLevel, category, topicHints, quizzes, assignments } = req.body;
    if (!courseName || !quizzes?.length) {
      return res.status(400).json({ success: false, error: 'courseName and quizzes required.' });
    }

    const bank = new QuizBank({
      courseName: courseName.trim(),
      courseLevel: courseLevel || 'Intermediate',
      category:    category    || '',
      topicHints:  topicHints  || '',
      creator:     req.user.id,
      quizzes,
      assignments: assignments || [],
    });

    res.status(201).json({ success: true, message: 'Saving in background...' });

    bank.save()
      .then(() => console.log(`✅ QuizBank "${courseName}" saved`))
      .catch(e  => console.error(`❌ QuizBank save error:`, e.message));

  } catch (e) {
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/quizbank/mine  — teacher: own quiz banks (full data with modelAnswer)
router.get('/mine', fetchuser, roleCheck(['teacher']), async (req, res) => {
  try {
    const banks = await QuizBank.find({ creator: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, quizBanks: banks });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/quizbank/all  — students: all quiz banks, modelAnswer hidden
router.get('/all', fetchuser, roleCheck(['student', 'teacher']), async (req, res) => {
  try {
    const banks = await QuizBank.find().populate('creator', 'name').sort({ createdAt: -1 }).lean();
    const isTeacher = req.user.role === 'teacher';
    const studentId = req.user.id; // ✅ FIX
    //console.log('🔍 Filtering with studentId:', studentId);
    const result = banks.map(b => ({
  ...b,
  attempts: isTeacher ? b.attempts : (b.attempts || []).filter(a => a.student?.toString() === studentId),
  assignmentSubmissions: isTeacher
    ? (b.assignmentSubmissions || [])
    : (b.assignmentSubmissions || []).filter(s => s.student?.toString() === studentId),
  assignments: b.assignments.map(a => ({
    ...a,
    modelAnswer: isTeacher ? a.modelAnswer : undefined,
  })),
}));

    res.json({ success: true, quizBanks: result });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/quizbank/attempt  — student submits quiz
router.post('/attempt', fetchuser, roleCheck(['student']), async (req, res) => {
  try {
    const { quizBankId, quizIndex, answers } = req.body;
    const bank = await QuizBank.findById(quizBankId);
    if (!bank) return res.status(404).json({ success: false, error: 'Not found' });

    const quiz = bank.quizzes[quizIndex];
    if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });

    let correct = 0;
    const results = quiz.questions.map((q, i) => {
      const ok = answers[i] === q.answer;
      if (ok) correct++;
      return {
        question:    q.question,
        yourAnswer:  answers[i] ?? 'Not answered',
        correct:     q.answer,
        explanation: q.explanation,
        isCorrect:   ok,
      };
    });

    const score = Math.round((correct / quiz.questions.length) * 100);

    bank.attempts.push({ student: req.user.id, quizIndex, score, answers });
    await bank.save();

    res.json({ success: true, score, correct, total: quiz.questions.length, results });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/quizbank/assignment-submit  — student submits assignment
router.post('/assignment-submit', fetchuser, roleCheck(['student']), async (req, res) => {
  try {
    const { quizBankId, assignIndex, mcqAnswers, textAnswer } = req.body;
    const bank = await QuizBank.findById(quizBankId);
    if (!bank) return res.status(404).json({ success: false, error: 'Not found' });

    bank.assignmentSubmissions.push({
      student: req.user.id, assignIndex,
      mcqAnswers: mcqAnswers || [],
      textAnswer:  textAnswer  || '',
    });
    await bank.save();
    res.json({ success: true, message: 'Assignment submitted!' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/quizbank/:id
router.delete('/:id', fetchuser, roleCheck(['teacher']), async (req, res) => {
  try {
    const bank = await QuizBank.findById(req.params.id);
    if (!bank) return res.status(404).json({ success: false, error: 'Not found' });
    if (bank.creator.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await QuizBank.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;