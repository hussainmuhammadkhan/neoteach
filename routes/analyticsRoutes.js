const express   = require('express');
const router    = express.Router();
const fetchuser = require('../middleware/fetchUser');
const roleCheck = require('../middleware/roleCheck');
const Course    = require('../models/CreateCourse'); // ✅ Direct require — same as courseRoutes
const mongoose  = require('mongoose');

// ═══════════════════════════════════════════════════════════════
// Route 1: Student opens a course → record engagement
// POST /api/analytics/course-open/:courseId
// ═══════════════════════════════════════════════════════════════
router.post('/course-open/:courseId', fetchuser, async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const userId   = req.user.id; // keep as string — mongoose handles conversion
    const now      = new Date();
    const year     = now.getFullYear();
    const month    = now.getMonth() + 1;

    // ── Step 1: Check if student already enrolled ──────
    const alreadyEnrolled = await Course.findOne({
      _id: courseId,
      'enrolledStudents.student': userId,
    }).select('_id').lean();

    if (alreadyEnrolled) {
      // Update existing entry: increment visits + update lastSeen
      await Course.updateOne(
        { _id: courseId, 'enrolledStudents.student': userId },
        {
          $set: { 'enrolledStudents.$.lastSeen': now },
          $inc: { 'enrolledStudents.$.visits': 1, totalViews: 1 },
        }
      );
    } else {
      // First time: add new enrolled entry
      await Course.updateOne(
        { _id: courseId },
        {
          $push: {
            enrolledStudents: {
              student:  userId,
              openedAt: now,
              lastSeen: now,
              visits:   1,
            }
          },
          $inc: { totalViews: 1 },
        }
      );
    }

    // ── Step 2: Update monthly views ───────────────────
    const monthExists = await Course.findOne({
      _id: courseId,
      'monthlyViews.year':  year,
      'monthlyViews.month': month,
    }).select('_id').lean();

    if (monthExists) {
      await Course.updateOne(
        { _id: courseId, 'monthlyViews.year': year, 'monthlyViews.month': month },
        { $inc: { 'monthlyViews.$.views': 1 } }
      );
    } else {
      await Course.updateOne(
        { _id: courseId },
        { $push: { monthlyViews: { year, month, views: 1 } } }
      );
    }

    console.log(`✅ course-open recorded: courseId=${courseId} userId=${userId}`);
    res.json({ success: true });

  } catch (err) {
    console.error('❌ course-open error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// Route 2: Teacher Analytics Dashboard
// GET /api/analytics/dashboard
// ✅ NO .populate() — uses $lookup aggregation
// ✅ Works with old courses (no enrolledStudents field)
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', fetchuser, roleCheck(['teacher']), async (req, res) => {
  try {
    const teacherId = new mongoose.Types.ObjectId(req.user.id);

    // ── Detect actual users collection name ───────────
    // MongoDB collection = lowercase plural of model name
    // Common names: 'users', 'user' — try to detect
    const collections = await mongoose.connection.db
      .listCollections().toArray();
    const collNames   = collections.map(c => c.name);
    const userColl    = collNames.find(n => n === 'users') ||
                        collNames.find(n => n === 'user')  ||
                        'users'; // fallback

    // ── Aggregation: courses + enrolled student info ──
    const courses = await Course.aggregate([
      { $match: { creator: teacherId } },
      { $sort:  { createdAt: -1 } },
      {
        // Add safe defaults for old docs missing these fields
        $addFields: {
          enrolledStudents: { $ifNull: ['$enrolledStudents', []] },
          monthlyViews:     { $ifNull: ['$monthlyViews',     []] },
          totalViews:       { $ifNull: ['$totalViews',       0]  },
        }
      },
      {
        $lookup: {
          from:         userColl,
          localField:   'enrolledStudents.student',
          foreignField: '_id',
          as:           '_studentDocs',
        }
      },
      {
        $project: {
          title:            1,
          category:         1,
          level:            1,
          createdAt:        1,
          totalViews:       1,
          monthlyViews:     1,
          enrolledStudents: 1,
          _studentDocs: {
            _id:   1,
            name:  1,
            email: 1,
          },
        }
      }
    ]);

    // ── Build last 12 months array ─────────────────────
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    // ── Per-course stats ───────────────────────────────
    const courseStats = courses.map(c => {
      const enrolled   = Array.isArray(c.enrolledStudents) ? c.enrolledStudents : [];
      const monthlyV   = Array.isArray(c.monthlyViews)     ? c.monthlyViews     : [];
      const studentDoc = Array.isArray(c._studentDocs)     ? c._studentDocs     : [];

      // Build userId → user info map
      const userMap = {};
      studentDoc.forEach(u => {
        if (u._id) userMap[u._id.toString()] = u;
      });

      // Build student list with names
      const studentList = enrolled.map(e => {
        const sid = e.student?.toString() || '';
        const u   = userMap[sid] || {};
        return {
          id:       e.student,
          name:     u.name    || 'Student',
          email:    u.email   || '',
          openedAt: e.openedAt,
          lastSeen: e.lastSeen,
          visits:   e.visits  || 1,
        };
      });

      const uniqueStudents = new Set(
        enrolled.map(e => e.student?.toString()).filter(Boolean)
      ).size;

      const totalVisits = enrolled.reduce((s, e) => s + (e.visits || 1), 0);
      const engRate     = uniqueStudents > 0
        ? (totalVisits / uniqueStudents).toFixed(1)
        : '0';

      // Last 6 months mini chart for this course
      const courseMonthly = months.slice(6).map(({ year, month }) => {
        const entry = monthlyV.find(
          m => m.year === year && m.month === month
        );
        const label = new Date(year, month - 1, 1)
          .toLocaleString('default', { month: 'short' });
        return { label, views: entry ? entry.views : 0 };
      });

      return {
        _id:            c._id,
        title:          c.title    || 'Untitled',
        category:       c.category || '—',
        level:          c.level    || '—',
        createdAt:      c.createdAt,
        totalStudents:  uniqueStudents,
        totalViews:     c.totalViews || 0,
        engagementRate: engRate,
        courseMonthly,
        students:       studentList,
      };
    });

    // ── Overview totals ────────────────────────────────
    const totalCourses = courseStats.length;

    const allStudentIds = new Set(
      courseStats
        .flatMap(c => c.students.map(s => s.id?.toString()))
        .filter(Boolean)
    );
    const totalStudents = allStudentIds.size;

    const totalViews = courseStats.reduce((s, c) => s + (c.totalViews || 0), 0);

    const allVisits = courseStats.flatMap(
      c => c.students.map(s => s.visits || 1)
    );
    const avgEngagement = allVisits.length
      ? (allVisits.reduce((a, b) => a + b, 0) / allVisits.length).toFixed(1)
      : '0';

    // ── Monthly chart — last 12 months (all courses) ───
    const monthlyChart = months.map(({ year, month }) => {
      const views = courses.reduce((sum, c) => {
        const mv    = Array.isArray(c.monthlyViews) ? c.monthlyViews : [];
        const entry = mv.find(m => m.year === year && m.month === month);
        return sum + (entry ? entry.views : 0);
      }, 0);
      const label = new Date(year, month - 1, 1)
        .toLocaleString('default', { month: 'short' });
      return { label: `${label} '${String(year).slice(2)}`, views, month, year };
    });

    res.json({
      success: true,
      data: {
        overview: { totalCourses, totalStudents, totalViews, avgEngagement },
        monthlyChart,
        courses: courseStats,
      }
    });

  } catch (err) {
    console.error('❌ analytics dashboard error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;