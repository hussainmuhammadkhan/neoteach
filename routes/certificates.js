const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const fetchUser = require('../middleware/fetchUser'); // your JWT middleware

const {
  generateCertificate,
  verifyCertificate,
  getStudentCertificates,
  getPdfPath,
} = require('../services/certificateService');

// ══════════════════════════════════════════════════════════
// POST /api/certificates/generate
// Body: { quizBankId: string }
// Auth: JWT required
// ══════════════════════════════════════════════════════════
router.post('/generate', fetchUser, async (req, res) => {
  try {
    const studentId  = req.user.id;          // set by fetchUser middleware
    const { quizBankId } = req.body;

    if (!quizBankId) {
      return res.status(400).json({ success: false, msg: 'quizBankId is required' });
    }

    //console.log(`[Route] /generate — student: ${studentId}, bank: ${quizBankId}`);

    const result = await generateCertificate(studentId, quizBankId);

    // Return 200 whether it's new or already existed
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Route] /generate error:', err);
    return res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/certificates/my
// Auth: JWT required
// ══════════════════════════════════════════════════════════
router.get('/my', fetchUser, async (req, res) => {
  try {
    const studentId = req.user.id;
    const baseUrl   = `${req.protocol}://${req.get('host')}`;

    //console.log(`[Route] /my — student: ${studentId}`);

    const certs = await getStudentCertificates(studentId, baseUrl);
    return res.status(200).json({ success: true, data: certs });
  } catch (err) {
    console.error('[Route] /my error:', err);
    return res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/certificates/verify/:code
// Public — no auth needed
// ══════════════════════════════════════════════════════════
router.get('/verify/:code', async (req, res) => {
  try {
    const result = await verifyCertificate(req.params.code);
    if (!result) {
      return res.status(404).json({ success: false, msg: 'Certificate not found' });
    }
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[Route] /verify error:', err);
    return res.status(500).json({ success: false, msg: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/certificates/download/:certId
// Auth: JWT required (token in header or query param)
// ══════════════════════════════════════════════════════════
const flexAuth = (req, res, next) => {
  // ✅ Agar header mein nahi toh query param se le lo
  if (!req.headers['auth-token'] && req.query.token) {
    req.headers['auth-token'] = req.query.token;
  }
  next();
};
router.get('/download/:certId', fetchUser, async (req, res) => {
  try {
    const pdfPath = await getPdfPath(req.params.certId);

    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return res.status(404).json({ success: false, msg: 'PDF not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${path.basename(pdfPath)}"`
    );
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('[Route] /download error:', err);
    return res.status(500).json({ success: false, msg: err.message });
  }
});

module.exports = router;