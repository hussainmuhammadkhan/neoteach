const express   = require('express');
const router    = express.Router();
const fetchuser = require('../middleware/fetchUser');
const Course    = require('../models/CreateCourse');
const QuizModel = require('../models/QuizModel');
const User      = require('../models/User');
const mongoose  = require('mongoose');

router.get('/overview', fetchuser, async (req, res) => {
  try {
    const studentId = req.user.id;

    // ── User + completed lessons ───────────────────────
    const userDoc          = await User.findById(studentId);
    const completedLessons = userDoc?.completedLessons?.length || 0;

    // ── Enrolled courses ───────────────────────────────
    // ✅ New — 'enrolledStudents.student' field use karo
const enrolledCourses = await Course.find({
  'enrolledStudents.student': new mongoose.Types.ObjectId(studentId)
});

    // ── Quiz attempts ──────────────────────────────────
    const quizBanks = await QuizModel.find({
      'attempts.student': studentId
    });

    let totalScore = 0, quizCount = 0, maxScore = 0;
    const quizScores = [];

    quizBanks.forEach(qb => {
      qb.attempts?.forEach(a => {
        if (a.student?.toString() === studentId) {
          totalScore += a.score || 0;
          maxScore    = Math.max(maxScore, a.score || 0);
          quizCount++;
          quizScores.push({
            score:       a.score || 0,
            completedAt: a.completedAt,
            quizTitle:   qb.quizzes?.[a.quizIndex]?.title || `Quiz ${a.quizIndex + 1}`,
            courseName:  qb.courseName,
          });
        }
      });
    });

    const avgScore = quizCount > 0 ? Math.round(totalScore / quizCount) : 0;

    // ── Leaderboard — top 5 students ──────────────────
    const leaderboardRaw = await QuizModel.aggregate([
      { $unwind: '$attempts' },
      { $group: {
        _id:       '$attempts.student',
        avgScore:  { $avg: '$attempts.score' },
        quizCount: { $sum: 1 },
        maxScore:  { $max: '$attempts.score' },
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 5 },
      
// NAYA:
{ $lookup: {
    from:         'users',
    localField:   '_id',
    foreignField: '_id',
    as:           'user',
}},
{ $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
{ $lookup: {                          // ✅ ADD
    from:         'profile_users',
    localField:   '_id',
    foreignField: 'userId',
    as:           'profile',
}},
{ $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    ]);

    const leaderboard = leaderboardRaw.map((s, i) => ({
  rank:          i + 1,
  name:          s.user?.name || 'Student',
  avgScore:      Math.round(s.avgScore || 0),
  quizCount:     s.quizCount,
  maxScore:      Math.round(s.maxScore || 0),
  isCurrentUser: s._id?.toString() === studentId,
  medal:         i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⭐',
  profileImage:  s.profile?.avatar || null,  // ✅ ADD
}));

    // ── Current student rank ───────────────────────────
    const allStudents = await QuizModel.aggregate([
      { $unwind: '$attempts' },
      { $group: { _id: '$attempts.student', avg: { $avg: '$attempts.score' } } },
      { $sort: { avg: -1 } }
    ]);
    const rankIndex = allStudents.findIndex(s => s._id?.toString() === studentId);
    const rank      = rankIndex >= 0 ? rankIndex + 1 : 999;

    // ── Course progress ────────────────────────────────
    const courseProgressList = enrolledCourses.map(c => {
      const totalLessons      = c.aiContent?.topics?.length || 0;
      const completedInCourse = (userDoc?.completedLessons || [])
        .filter(l => l.startsWith(c._id.toString())).length;
      const progress = totalLessons > 0
        ? Math.round((completedInCourse / totalLessons) * 100) : 0;

      // ✅ New — visits aur readTime add karo
const studentEnrollment = c.enrolledStudents?.find(
  e => e.student?.toString() === studentId
);

return {
  id:               c._id.toString(),
  name:             c.title,
  progress,
  lessonsCompleted: completedInCourse,
  totalLessons,
  lastAccessed:     studentEnrollment?.lastSeen
    ? _timeAgo(new Date(studentEnrollment.lastSeen)) : 'Recently',
  visits:           studentEnrollment?.visits || 0,           // ✅ kitni bar open kiya
  readMinutes:      (completedInCourse * 8) + (studentEnrollment?.visits || 0) * 2, // ✅ estimate
};
    });

    // ── AI Insights ────────────────────────────────────
    const insights = _generateInsights({
      avgScore, quizCount, completedLessons,
      rank, coursesCount: enrolledCourses.length,
    });

    // ── Total learning time estimate ───────────────────
    const totalMinutes = completedLessons * 8 + quizCount * 5;
    const hours        = Math.floor(totalMinutes / 60);
    const mins         = totalMinutes % 60;
    const timeSpent    = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    res.json({
      stats: {
        totalLearningTime: timeSpent,
        lessonsCompleted:  completedLessons,
        avgQuizScore:      avgScore,
        maxQuizScore:      maxScore,
        quizCount,
        rank,
        coursesEnrolled:   enrolledCourses.length,
      },
      courseProgress: courseProgressList,
      recentQuizzes:  quizScores.slice(-5).reverse(),
      leaderboard,    // ✅ top 5
      insights,
      recentCourses: (userDoc?.recentCourses || [])   // ✅ ADD — recently opened courses
        .slice(-5).reverse()
        .map(r => ({ courseId: r.courseId, courseName: r.courseName })),
    });

  } catch (err) {
    console.error('Progress overview error:', err.message);
    res.status(500).json({ msg: err.message });
  }
});

function _timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)   return `${mins} minutes ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)} hours ago`;
  return `${Math.floor(mins / 1440)} days ago`;
}

function _generateInsights({ avgScore, quizCount, completedLessons, rank, coursesCount }) {
  const insights = [];

  if (avgScore >= 85) {
    insights.push({
      title:       'Excellent Quiz Performance! 🌟',
      description: `Your average score of ${avgScore}% is outstanding. Keep it up!`,
      type:        'strength',
    });
  } else if (avgScore >= 70) {
    insights.push({
      title:       'Good Quiz Scores 📈',
      description: `You're averaging ${avgScore}%. Push to 85%+ to unlock more badges!`,
      type:        'strength',
    });
  }

  if (avgScore < 70 && quizCount > 0) {
    insights.push({
      title:       'Quiz Performance Needs Attention',
      description: `Your avg score is ${avgScore}%. Review lessons before attempting quizzes.`,
      type:        'improvement',
    });
  }

  if (completedLessons === 0) {
    insights.push({
      title:       'Start Learning Today! 🚀',
      description: 'Open a course and complete your first lesson to earn badges.',
      type:        'insight',
    });
  } else if (completedLessons >= 10) {
    insights.push({
      title:       'Active Learner! 📚',
      description: `You've completed ${completedLessons} lessons. Great consistency!`,
      type:        'strength',
    });
  }

  if (rank <= 10) {
    insights.push({
      title:       'Top 10 Leaderboard! 🏆',
      description: `You're ranked #${rank}. Keep quizzing to stay on top!`,
      type:        'strength',
    });
  } else if (rank <= 50) {
    insights.push({
      title:       'Rising on Leaderboard 📊',
      description: `You're ranked #${rank}. Score higher on quizzes to climb up!`,
      type:        'insight',
    });
  }

  if (coursesCount >= 3) {
    insights.push({
      title:       'Multi-Course Learner! 🎓',
      description: `Enrolled in ${coursesCount} courses. On track for the Scholar badge!`,
      type:        'insight',
    });
  }

  return insights.slice(0, 3);
}
// ══════════════════════════════════════════════════════
// POST /api/badges/lesson-complete — Lesson mark as done
// ══════════════════════════════════════════════════════
router.post('/lesson-complete', fetchuser, async (req, res) => {
  try {
    const { courseId, lessonNum } = req.body;
    const studentId = req.user.id;

    // ✅ Unique lesson key — courseId:lessonNum
    const lessonKey = `${courseId}:${lessonNum}`;

    // ✅ User model mein completedLessons array update karo
    await User.findByIdAndUpdate(
      studentId,
      {
        $addToSet: { completedLessons: lessonKey }, // duplicate nahi hoga
        $push: {
          lessonActivity: {
            $each: [{ lessonKey, date: new Date() }],
            $slice: -200, // last 200 activities rakho
          },
        },
      },
      { upsert: false }
    );

    res.json({ success: true, lessonKey });
  } catch (err) {
    console.error('lesson-complete error:', err.message);
    res.status(500).json({ msg: err.message });
  }
});
module.exports = router;

// ══════════════════════════════════════════════════════
// POST /api/progress/course-open — Track course open
// ══════════════════════════════════════════════════════
router.post('/course-open', fetchuser, async (req, res) => {
  try {
    const { courseId, courseName } = req.body;
    const studentId = req.user.id;

    await User.findByIdAndUpdate(studentId, {
      $push: {
        recentCourses: {
          $each: [{ courseId, courseName, openedAt: new Date() }],
          $slice: -10, // keep last 10
        }
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/progress/weekly — Weekly activity last 7 days
// ══════════════════════════════════════════════════════
router.get('/weekly', fetchuser, async (req, res) => {
  try {
    const studentId = req.user.id;
    const userDoc   = await User.findById(studentId);

    // Last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const label  = d.toLocaleDateString('en', { weekday: 'short' });

      // Count lessons completed that day
      const lessonsCount = (userDoc?.lessonActivity || [])
        .filter(a => a.date?.toISOString().split('T')[0] === dayStr).length;

      // Count quizzes attempted that day
      const quizBanks = await QuizModel.find({ 'attempts.student': studentId });
      let quizCount = 0;
      quizBanks.forEach(qb => {
        qb.attempts?.forEach(a => {
          if (a.student?.toString() === studentId) {
            const aDate = a.completedAt?.toISOString().split('T')[0];
            if (aDate === dayStr) quizCount++;
          }
        });
      });

      days.push({
        day:      label,
        date:     dayStr,
        lessons:  lessonsCount,
        quizzes:  quizCount,
        activity: lessonsCount + quizCount,
      });
    }

    res.json(days);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});