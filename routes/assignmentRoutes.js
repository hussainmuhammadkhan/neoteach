const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const FormData   = require('form-data');
const axios      = require('axios');
const fetchuser  = require('../middleware/fetchUser');
const QuizModel  = require('../models/QuizModel');

const SCORER_URL = 'http://localhost:8001';

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
});

// ══════════════════════════════════════════════════════
// POST /api/assignments/submit — PDF upload + score
// ══════════════════════════════════════════════════════
router.use((req, res, next) => {
  //console.log('📍 Assignment route:', req.method, req.path);
  next();
});
router.post('/submit', fetchuser, upload.single('file'), async (req, res) => {
  try {
    const { quizBankId, assignIndex } = req.body;
    const studentId = req.user.id;

    if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });

    const bank = await QuizModel.findById(quizBankId);
    if (!bank) return res.status(404).json({ msg: 'Quiz bank not found' });

    const assignment = bank.assignments?.[parseInt(assignIndex)];
    if (!assignment) return res.status(404).json({ msg: 'Assignment not found' });

    const modelAnswer = assignment.modelAnswer || assignment.description || '';
    const rubric      = assignment.rubric || '';

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename:    req.file.originalname,
      contentType: 'application/pdf',
    });
    form.append('model_answer', modelAnswer);
    form.append('rubric',       rubric);

    const scorerResp = await axios.post(`${SCORER_URL}/score-assignment`, form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });

    const result = scorerResp.data;
    if (!result.success) return res.status(400).json({ msg: result.error });

    await QuizModel.findByIdAndUpdate(quizBankId, {
      $push: {
        assignmentSubmissions: {
          student:     studentId,
          assignIndex: parseInt(assignIndex),
          textAnswer:  result.extracted_text || '',
          submittedAt: new Date(),
          score:       result.score,
          type:        'assignment', 
        }
      }
    });

    res.json({
  success:      true,
  score:        result.score,
  feedback:     result.feedback,
  similarity:   result.similarity    ?? 0,
  keywordMatch: result.keywordMatch  ?? result.keyword_match  ?? 0,
  wordCount:    result.wordCount     ?? result.word_count     ?? 0,
  rubricHits:   result.rubricHits    ?? result.rubric_hits    ?? [],
  rubricMiss:   result.rubricMiss    ?? result.rubric_miss    ?? [],
});

  } catch (err) {
    console.error('Assignment submit error:', err.message);
    res.status(500).json({ msg: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/assignments/case-study/submit
// ══════════════════════════════════════════════════════
router.post('/case-study/submit', fetchuser, async (req, res) => {
  try {
    const { quizBankId, caseIndex, answers } = req.body;
    const studentId = req.user.id;
    //console.log('🔍 Saving with studentId:', studentId); // ← ADD
    const bank = await QuizModel.findById(quizBankId);
    if (!bank) return res.status(404).json({ msg: 'Quiz bank not found' });
    

    const caseStudies = (bank.assignments || [])
      .filter(a => a.type === 'case_study');
    const caseStudy = caseStudies[parseInt(caseIndex)];
    if (!caseStudy) return res.status(404).json({ msg: 'Case study not found' });

    // ✅ Full array mein actual index dhundo
    const actualIndex = (bank.assignments || []).indexOf(caseStudy);
//     console.log('🔍 actualIndex:', actualIndex);  // ← ADD
// console.log('🔍 caseStudies length:', caseStudies.length);  // ← ADD
// console.log('🔍 bank.assignments length:', bank.assignments?.length);  

    const questions = (caseStudy.questions?.length)
      ? caseStudy.questions
      : (caseStudy.instructions || []);

    const model_answers = questions.map(() =>
      caseStudy.modelAnswer || caseStudy.description || ''
    );

    const rubric = caseStudy.rubric || '';

    const scorerResp = await axios.post(`${SCORER_URL}/score-case-study`, {
      answers,
      questions,
      model_answers,
      rubric,
    }, { timeout: 60000 });

    const result = scorerResp.data;
    if (!result.success) return res.status(400).json({ msg: result.error });

    await QuizModel.findByIdAndUpdate(quizBankId, {
      $push: {
        assignmentSubmissions: {
          student:     studentId,
          assignIndex: actualIndex,   // ← filtered index ki jagah actual index
          textAnswer:  answers.join('\n---\n'),
          score:       result.score,
          type:        'case_study',
          submittedAt: new Date(),
        }
      }
    });

    res.json({ success: true, ...result });

  } catch (err) {
    console.error('Case study submit error:', err.message);
    res.status(500).json({ msg: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/assignments/my-submissions/:quizBankId
// ══════════════════════════════════════════════════════
router.get('/my-submissions/:quizBankId', fetchuser, async (req, res) => {
  try {
    const bank = await QuizModel.findById(req.params.quizBankId);
    if (!bank) return res.status(404).json({ msg: 'Not found' });
    const mine = (bank.assignmentSubmissions || [])
      .filter(s => s.student?.toString() === req.user.id);
    res.json(mine);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

module.exports = router;