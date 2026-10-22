const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const fetchuser  = require('../middleware/fetchUser');
const User       = require('../models/User');
const ProfileUser = require('../models/ProfileUser'); // ✅ use ProfileUser model

const EMAIL_USER = "yourgmail@gmail.com";
const EMAIL_PASS = "your16digitapppassword";

// ── Upload folder ─────────────────────────────────────
const uploadDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/.test(
      path.extname(file.originalname).toLowerCase()
    );
    ok ? cb(null, true) : cb(new Error('Only image files allowed'));
  },
});

// ── Email transporter ─────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587, secure: false,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

// ════════════════════════════════════════════════════════
// GET /api/profile/get
// ════════════════════════════════════════════════════════
router.get('/get', fetchuser, async (req, res) => {
  try {
    const user    = await User.findById(req.user.id).select('-password').lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Get or create profile doc
    let profile = await ProfileUser.findOne({ userId: req.user.id }).lean();
    if (!profile) {
      profile = await ProfileUser.create({ userId: req.user.id });
    }

    res.json({ success: true, profile: {
      _id:           user._id,
      name:          user.name,
      email:         user.email,
      role:          user.role,
      phone:         profile.phone      || '',
      location:      profile.location   || '',
      bio:           profile.bio        || '',
      avatar:        profile.avatar     || '',
      level:         profile.level      || 1,
      streak:        profile.streak     || 0,
      notifications: profile.notifications,
      darkMode:      profile.darkMode,
      emailUpdates:  profile.emailUpdates,
      twoFactor:     profile.twoFactor,
      language:      profile.language   || 'English',
    }});
  } catch (e) {
    console.error('GET profile error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// POST /api/profile/update
// ════════════════════════════════════════════════════════
router.post('/update', fetchuser, async (req, res) => {
  try {
    const { name, phone, location, bio } = req.body;

    // Update name in User model
    if (name) await User.findByIdAndUpdate(req.user.id, { $set: { name: name.trim() } });

    // Update rest in ProfileUser model
    const updates = {};
    if (phone    !== undefined) updates.phone    = phone.trim();
    if (location !== undefined) updates.location = location.trim();
    if (bio      !== undefined) updates.bio      = bio.trim();

    await ProfileUser.findOneAndUpdate(
      { userId: req.user.id },
      { $set: updates },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Profile updated' });
  } catch (e) {
    console.error('UPDATE profile error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// POST /api/profile/avatar
// ✅ FIX: multer runs AFTER fetchuser — token read from header correctly
// ════════════════════════════════════════════════════════
router.post('/avatar', fetchuser, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Delete old avatar file if exists
    const existing = await ProfileUser.findOne({ userId: req.user.id });
    if (existing?.avatar) {
      const oldPath = path.join(__dirname, '../', existing.avatar);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const avatarPath = `uploads/avatars/${req.file.filename}`;

    await ProfileUser.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { avatar: avatarPath } },
      { upsert: true, new: true }
    );

    res.json({ success: true, avatarPath });
  } catch (e) {
    console.error('AVATAR upload error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════
// POST /api/profile/change-password
// ✅ FIX: reads password from User model (where bcrypt hash is stored)
// ════════════════════════════════════════════════════════
router.post('/change-password', fetchuser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both fields required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be 6+ characters' });
    }

    // ✅ MUST use User model — password hash is stored there
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.user.id, { $set: { password: hashed } });

    // Send email notification
    try {
      await transporter.sendMail({
        from:    EMAIL_USER,
        to:      user.email,
        subject: 'Password Changed — NeoTeach',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;
                      padding:24px;border:1px solid #e0e0e0;border-radius:12px;">
            <h2 style="color:#009688;">🔐 Password Changed Successfully</h2>
            <p>Hi <strong>${user.name}</strong>,</p>
            <p>Your NeoTeach password was successfully changed.</p>
            <p style="color:#f44336;">
              If you did not do this, contact support immediately.
            </p>
            <hr/>
            <p style="font-size:12px;color:#9e9e9e;">NeoTeach Security Team</p>
          </div>
        `,
      });
    } catch (_) { /* email fail — don't block response */ }

    res.json({ success: true, message: 'Password changed. Confirmation email sent.' });
  } catch (e) {
    console.error('CHANGE-PASSWORD error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// POST /api/profile/settings
// ════════════════════════════════════════════════════════
router.post('/settings', fetchuser, async (req, res) => {
  try {
    const { notifications, darkMode, language, emailUpdates, twoFactor } = req.body;
    const updates = {};
    if (notifications !== undefined) updates.notifications = notifications;
    if (darkMode      !== undefined) updates.darkMode      = darkMode;
    if (emailUpdates  !== undefined) updates.emailUpdates  = emailUpdates;
    if (twoFactor     !== undefined) updates.twoFactor     = twoFactor;
    if (language      !== undefined) updates.language      = language;

    await ProfileUser.findOneAndUpdate(
      { userId: req.user.id },
      { $set: updates },
      { upsert: true }
    );
    res.json({ success: true, message: 'Settings saved' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// DELETE /api/profile/delete
// ════════════════════════════════════════════════════════
router.delete('/delete', fetchuser, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    await ProfileUser.findOneAndDelete({ userId: req.user.id });
    res.json({ success: true, message: 'Account deleted' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;