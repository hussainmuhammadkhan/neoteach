const path        = require('path');
const Certificate = require('../models/Certificate');
const QuizModel   = require('../models/QuizModel');
const User        = require('../models/User');
const { generateCertificateText } = require('./openaiService');
const { generateCertificatePdf  } = require('./pdfService');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'certificates');
const MIN_SCORE  = 50;

// ── Helpers ───────────────────────────────────────────────
function _generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part  = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `NEO-${part}`;
}

function _determineLevel(score) {
  if (score >= 90) return 'Distinction';
  if (score >= 70) return 'Excellent';
  return 'Pass';
}

/**
 * ✅ FIX: Compare IDs safely using String() on both sides.
 * Previously ObjectId.toString() sometimes failed if student field
 * was not populated or was already a string.
 */
function _matchStudent(fieldVal, sid) {
  if (!fieldVal) return false;
  return String(fieldVal) === String(sid);
}

/**
 * Checks whether a student has fully completed a quiz bank.
 * Returns { completed: bool, averageScore: number }
 */
function checkBankCompletion(bank, studentId) {
  const sid = String(studentId);

  const quizzes     = Array.isArray(bank.quizzes)               ? bank.quizzes               : [];
  const attempts    = Array.isArray(bank.attempts)               ? bank.attempts               : [];
  const assignments = Array.isArray(bank.assignments)            ? bank.assignments            : [];
  const submissions = Array.isArray(bank.assignmentSubmissions)  ? bank.assignmentSubmissions  : [];

  let totalScore = 0, scoreCount = 0;

  // ── Quizzes ───────────────────────────────────────────
  for (let i = 0; i < quizzes.length; i++) {
    // ✅ FIX: filter by student using safe string comparison
    const mine = attempts.filter(
      (a) => _matchStudent(a.student, sid) && Number(a.quizIndex) === i
    );

    console.log(`[CertCheck] Quiz ${i}: found ${mine.length} attempts for student ${sid}`);

    if (mine.length === 0) {
      console.log(`[CertCheck] ❌ No attempt for quiz index ${i}`);
      return { completed: false, averageScore: 0 };
    }
    const best = Math.max(...mine.map((a) => Number(a.score) || 0));
    if (best < MIN_SCORE) {
      console.log(`[CertCheck] ❌ Quiz ${i} best score ${best} < ${MIN_SCORE}`);
      return { completed: false, averageScore: 0 };
    }
    totalScore += best;
    scoreCount++;
  }

  // ── Assignments + case studies ────────────────────────
  for (let i = 0; i < assignments.length; i++) {
    const asn  = assignments[i];
    const type = asn.type === 'case_study' ? 'case_study' : 'assignment';

    const mine = submissions.filter((s) => {
      const matchIdx  = Number(s.assignIndex) === i;
      const matchType = type === 'case_study'
        ? s.type === 'case_study'
        : (s.type === 'assignment' || !s.type);
      const matchUser = _matchStudent(s.student, sid);
      return matchIdx && matchType && matchUser;
    });

    console.log(`[CertCheck] Assignment ${i} (${type}): found ${mine.length} submissions`);

    if (mine.length === 0) {
      console.log(`[CertCheck] ❌ No submission for assignment index ${i}`);
      return { completed: false, averageScore: 0 };
    }
    const best = Math.max(...mine.map((s) => Number(s.score) || 0));
    if (best < MIN_SCORE) {
      console.log(`[CertCheck] ❌ Assignment ${i} best score ${best} < ${MIN_SCORE}`);
      return { completed: false, averageScore: 0 };
    }
    totalScore += best;
    scoreCount++;
  }

  const averageScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;
  //console.log(`[CertCheck] ✅ Completed! averageScore=${averageScore}`);
  return { completed: true, averageScore };
}

// ══════════════════════════════════════════════════════════
// generateCertificate
// ══════════════════════════════════════════════════════════
async function generateCertificate(studentId, quizBankId) {
  // ── 1. Fetch student ─────────────────────────────────
  const student = await User.findById(studentId);
  if (!student) throw new Error('Student not found');

  // ── 2. Fetch quiz bank ───────────────────────────────
  // ✅ FIX: Do NOT populate attempts/submissions — they are embedded arrays.
  // Using lean() for faster reads.
  const bank = await QuizModel.findById(quizBankId).lean();
  if (!bank) throw new Error('Quiz bank not found');

  //console.log(`[CertGen] Bank: ${bank.courseName}, quizzes: ${bank.quizzes?.length}, attempts: ${bank.attempts?.length}, assignments: ${bank.assignments?.length}, submissions: ${bank.assignmentSubmissions?.length}`);

  // ── 3. Check full completion ─────────────────────────
  const { completed, averageScore } = checkBankCompletion(bank, studentId);
  if (!completed) {
    return {
      success: false,
      message: 'Course not fully completed yet. Pass all quizzes, assignments, and case studies with ≥ 50%.',
    };
  }

  // ── 4. Duplicate check ───────────────────────────────
  const existing = await Certificate.findOne({ student: studentId, quizBank: quizBankId });
  if (existing) {
    // ✅ Return existing cert with downloadUrl so Flutter can show it
    const baseUrl = process.env.BASE_URL || '';
    return {
      success: true,
      message: 'Certificate already exists.',
      data: {
        ...existing.toObject(),
        downloadUrl: `${baseUrl}/api/certificates/download/${existing._id}`,
      },
    };
  }

  // ── 5. Determine performance level ───────────────────
  const performanceLevel = _determineLevel(averageScore);

  // ── 6. AI-generated text ─────────────────────────────
  const aiText = await generateCertificateText(
    student.name, bank.courseName, performanceLevel, averageScore
  );

  // ── 7. Build certificate document ────────────────────
  let certCode;
  for (let i = 0; i < 5; i++) {
    certCode = _generateCode();
    if (!(await Certificate.findOne({ certificateCode: certCode }))) break;
  }

  const cert = new Certificate({
    certificateCode: certCode,
    student:         studentId,
    studentName:     student.name,
    quizBank:        quizBankId,
    courseName:      bank.courseName,
    averageScore,
    performanceLevel,
    aiGeneratedText: aiText,
    completionDate:  new Date(),
    issuedAt:        new Date(),
  });

  // ── 8. Generate PDF ───────────────────────────────────
  try {
    cert.pdfPath = await generateCertificatePdf({
      certId:         cert._id.toString(),
      studentName:    student.name,
      courseName:     bank.courseName,
      performanceLevel,
      aiText,
      certCode,
      completionDate: cert.completionDate,
      score:          averageScore,
      outputDir:      OUTPUT_DIR,
    });
  } catch (pdfErr) {
    console.error('PDF generation failed:', pdfErr.message);
    cert.pdfPath = '';
  }

  // ── 9. Save ───────────────────────────────────────────
  await cert.save();
  //console.log(`✅ Certificate ${certCode} issued to ${student.name}`);

  const baseUrl = process.env.BASE_URL || 'http://10.10.16.145:5000';
  return {
    success: true,
    message: 'Certificate generated successfully.',
    data: {
      ...cert.toObject(),
      downloadUrl: `${baseUrl}/api/certificates/download/${cert._id}`,
    },
  };
}

// ══════════════════════════════════════════════════════════
// verifyCertificate
// ══════════════════════════════════════════════════════════
async function verifyCertificate(code) {
  const cert = await Certificate.findOne({ certificateCode: code.toUpperCase() });
  if (!cert) return null;
  return {
    studentName:      cert.studentName,
    courseName:       cert.courseName,
    issuedAt:         cert.issuedAt,
    performanceLevel: cert.performanceLevel,
    score:            cert.averageScore,
    status:           cert.isValid ? 'Valid' : 'Invalid',
  };
}

// ══════════════════════════════════════════════════════════
// getStudentCertificates
// ══════════════════════════════════════════════════════════
async function getStudentCertificates(studentId, baseUrl) {
  // ✅ FIX: Removed isValid:true filter so even edge-case certs show up.
  // Add it back if you want to hide revoked certs.
  const certs = await Certificate.find({ student: studentId })
    .sort({ issuedAt: -1 });

  return certs.map((c) => ({
    id:               c._id,
    certificateCode:  c.certificateCode,
    studentName:      c.studentName,
    courseName:       c.courseName,
    averageScore:     c.averageScore,
    performanceLevel: c.performanceLevel,
    aiGeneratedText:  c.aiGeneratedText,
    completionDate:   c.completionDate,
    issuedAt:         c.issuedAt,
    isValid:          c.isValid,
    downloadUrl:      `${baseUrl}/api/certificates/download/${c._id}`,
  }));
}

// ══════════════════════════════════════════════════════════
// getPdfPath
// ══════════════════════════════════════════════════════════
async function getPdfPath(certId) {
  const cert = await Certificate.findById(certId);
  return cert?.pdfPath || null;
}

module.exports = {
  generateCertificate,
  verifyCertificate,
  getStudentCertificates,
  getPdfPath,
  checkBankCompletion,
};