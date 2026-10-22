const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const router   = express.Router();
// ✅ verifyToken NAHI hai — authMiddleware file exist nahi karti
// Agar baad mein add karna ho: const verifyToken = require('../middleware/authMiddleware');

// ── Upload folder ─────────────────────────────────────
const uploadDir = path.join(__dirname, '../uploads/chat');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Multer storage config ─────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});

// ── File type filter ──────────────────────────────────
const fileFilter = (req, file, cb) => {
  // ✅ Log karo — debug ke liye
  console.log(`📎 Upload attempt — mimetype: "${file.mimetype}" | file: "${file.originalname}"`);

  // ✅ Flutter kabhi kabhi "application/octet-stream" bhejta hai
  // Extension se detect karo agar mimetype generic ho
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.zip',
  ];

  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
    'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',  // ✅ Flutter ka generic fallback
  ];

  const mimeOk = allowedMimes.includes(file.mimetype)
    || file.mimetype.startsWith('image/');   // ✅ saari images allow
  const extOk  = allowedExts.includes(ext);

  if (mimeOk || extOk) {
    cb(null, true);
  } else {
    console.log(`❌ Blocked — mimetype: "${file.mimetype}" ext: "${ext}"`);
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ── POST /api/chat/upload ─────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { conversationId, senderId, fileType } = req.body;

    if (!conversationId || !senderId) {
      return res.status(400).json({
        success: false,
        message: 'conversationId and senderId are required',
      });
    }

    // ── BASE_URL from .env ────────────────────────────
    const baseUrl = process.env.BASE_URL || 'http://10.10.16.145:5000';
    const fileUrl = `${baseUrl}/uploads/chat/${req.file.filename}`;

    const sizeStr = req.file.size < 1024 * 1024
      ? `${(req.file.size / 1024).toFixed(1)} KB`
      : `${(req.file.size / (1024 * 1024)).toFixed(1)} MB`;

    console.log(`✅ File uploaded: ${req.file.filename} — ${sizeStr}`);

    return res.status(200).json({
      success:  true,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: sizeStr,
      fileType: fileType || (req.file.mimetype.startsWith('image/') ? 'image' : 'file'),
    });

  } catch (err) {
    console.error('❌ Chat file upload error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Multer error handler ──────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Max 10MB allowed.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

module.exports = router;