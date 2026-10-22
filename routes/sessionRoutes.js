const express              = require('express');
const router               = express.Router();
const Session              = require('../models/Session');
const TeacherProfile       = require('../models/TeacherProfile');
const User                 = require('../models/User');
const fetchuser            = require('../middleware/fetchUser');
const { sendPushNotification } = require('../services/fcm_service');

// POST /api/session — Student books
router.post('/', fetchuser, async (req, res) => {
  const { teacherId, teacherName, sessionType, date, time, notes, hourlyRate } = req.body;
  if (!teacherId || !teacherName || !sessionType || !date || !time)
    return res.status(400).json({ msg: 'All required fields must be filled' });
  try {
    const session = new Session({
      teacherId, teacherName,
      studentId:  req.user.id,
      sessionType, date, time,
      notes:      notes || '',
      hourlyRate: hourlyRate || 0,
      status:     'pending',
    });
    await session.save();

    // ✅ Notify teacher about new session request
    const teacher = await User.findById(teacherId);
    if (teacher?.fcmToken) {
      await sendPushNotification({
        token: teacher.fcmToken,
        title: '📚 New Session Request!',
        body:  `A student wants to book a session on ${new Date(date).toDateString()} at ${time}`,
        data:  { type: 'new_session', sessionId: session._id.toString() },
      });
    }

    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// GET /api/session/teacher — Teacher sessions
router.get('/teacher', fetchuser, async (req, res) => {
  try {
    const sessions = await Session.find({ teacherId: req.user.id })
      .populate('studentId', 'name email')
      .sort({ date: 1 });
    res.json(sessions);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/session/student — Student sessions
router.get('/student', fetchuser, async (req, res) => {
  try {
    const sessions = await Session.find({ studentId: req.user.id })
      .sort({ date: -1 });
    res.json(sessions);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/session/notifications — Student unread notifications
router.get('/notifications', fetchuser, async (req, res) => {
  try {
    const sessions = await Session.find({
      studentId:        req.user.id,
      notificationRead: false,
      status:           { $in: ['accepted', 'rejected'] }
    }).sort({ updatedAt: -1 });
    res.json(sessions);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// PATCH /api/session/notifications/read — Mark all read
router.patch('/notifications/read', fetchuser, async (req, res) => {
  try {
    await Session.updateMany(
      { studentId: req.user.id, notificationRead: false },
      { notificationRead: true }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// PATCH /api/session/:id/status — Teacher accept/reject ✅ FCM here
router.patch('/:id/status', fetchuser, async (req, res) => {
  try {
    const { status } = req.body;
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ msg: 'Not found' });
    if (session.teacherId.toString() !== req.user.id)
      return res.status(403).json({ msg: 'Not authorized' });

    session.status           = status;
    session.notificationRead = false;
    await session.save();

    const student = await User.findById(session.studentId);
    console.log('student:', student?.name, '| fcmToken:', student?.fcmToken || 'MISSING');

    if (student?.fcmToken) {
      const result = await sendPushNotification({
        token: student.fcmToken,
        title: status === 'accepted' ? '✅ Session Accepted!' : '❌ Session Rejected',
        body:  `${session.teacherName} ${status} your session`,
        data:  { type: 'session_status', status },
      });
      console.log('FCM result:', JSON.stringify(result));
    }

    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/session/schedule/:teacherId
router.get('/schedule/:teacherId', async (req, res) => {
  try {
    const profile = await TeacherProfile.findOne({ teacherId: req.params.teacherId });
    res.json(profile || {});
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;