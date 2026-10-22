const express        = require('express');
const router         = express.Router();
const TeacherProfile = require('../models/TeacherProfile');
const fetchuser      = require('../middleware/fetchUser');

// GET /api/teacher-profile/me — Get my profile
router.get('/me', fetchuser, async (req, res) => {
  try {
    let profile = await TeacherProfile.findOne({ teacherId: req.user.id });
    if (!profile) profile = { teacherId: req.user.id, skills: [], schedule: [], hourlyRate: 0, bio: '' };
    res.json(profile);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/teacher-profile/:teacherId — Student views teacher profile
router.get('/:teacherId', async (req, res) => {
  try {
    const profile = await TeacherProfile.findOne({ teacherId: req.params.teacherId })
      .populate('teacherId', 'name email');
    res.json(profile || {});
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/teacher-profile — Create or update profile
router.post('/', fetchuser, async (req, res) => {
  try {
    const { bio, hourlyRate, skills, schedule } = req.body;
    let profile = await TeacherProfile.findOne({ teacherId: req.user.id });
    if (profile) {
      profile.bio        = bio        ?? profile.bio;
      profile.hourlyRate = hourlyRate ?? profile.hourlyRate;
      profile.skills     = skills     ?? profile.skills;
      profile.schedule   = schedule   ?? profile.schedule;
    } else {
      profile = new TeacherProfile({ teacherId: req.user.id, bio, hourlyRate, skills, schedule });
    }
    await profile.save();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;