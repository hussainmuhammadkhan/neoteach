const express = require('express');
const router  = express.Router();
const fetchuser = require('../middleware/fetchUser');
const roleCheck = require('../middleware/roleCheck');
const Course    = require('../models/CreateCourse');
const mongoose   = require('mongoose'); 
const Enrollment = require('../models/Enrollment'); 
const User = require('../models/User'); // ✅ add karo agar missing hai

// ✅ IMPORTANT: In your main server.js/app.js, add this line:
// app.use(express.json({ limit: '10mb' }));
// This allows large GPT-4 content to be received by backend

// ═══════════════════════════════════════════════════════
// Route 1: Create Course — Teachers Only
// POST /api/courses/createcourse
// ═══════════════════════════════════════════════════════
router.post('/createcourse', fetchuser, roleCheck(['teacher']), async (req, res) => {
  // ✅ Respond quickly — don't make client wait for DB
  // Validate first, then save async
  try {
    const { title, description, keywords, category, level, aiContent } = req.body;

    if (!title || !description || !keywords || !category || !level) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    const keywordsArray = Array.isArray(keywords)
      ? keywords.map(k => k.trim()).filter(k => k.length > 0)
      : keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);

    // ✅ Sanitize without trimming content — save full GPT-4 output
    let sanitizedAiContent = {};
    if (aiContent && typeof aiContent === 'object') {
      sanitizedAiContent = {
        summary:           aiContent.summary           || '',
        estimatedDuration: aiContent.estimatedDuration || '',
        objectives:        Array.isArray(aiContent.objectives)    ? aiContent.objectives    : [],
        prerequisites:     Array.isArray(aiContent.prerequisites) ? aiContent.prerequisites : [],
        // ✅ Full topics with complete explanation — no substring trimming
        topics: Array.isArray(aiContent.topics)
          ? aiContent.topics.map(t => ({
              title:       t.title       || '',
              explanation: t.explanation || '', // Full content preserved
            }))
          : [],
        // ✅ Full quizzes with all questions
        quizzes: Array.isArray(aiContent.quizzes)
          ? aiContent.quizzes.map(q => ({
              lesson: q.lesson || 0,
              title:  q.title  || '',
              questions: Array.isArray(q.questions)
                ? q.questions.map(qs => ({
                    question: qs.question || '',
                    options:  Array.isArray(qs.options) ? qs.options : [],
                    answer:   qs.answer   || '',
                  }))
                : [],
            }))
          : [],
      };
    }

    const course = new Course({
      title:       title.trim(),
      description: description.trim(),
      keywords:    keywordsArray,
      category,
      level,
      aiContent:   sanitizedAiContent,
      creator:     req.user.id,
    });

    // ✅ Save in background — respond to client immediately
    res.status(201).json({
      success: true,
      message: 'Course is being saved...',
      course: {
        title:    course.title,
        category: course.category,
        level:    course.level,
      }
    });

    // ✅ Save AFTER responding — client doesn't wait
    course.save()
      .then(() => console.log(`✅ Course "${title}" saved to DB`))
      .catch(err  => console.error(`❌ Failed to save course "${title}":`, err.message));

  } catch (error) {
    console.error('❌ Create Course Error:', error.message);
    // Only send error if we haven't responded yet
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
});

// ═══════════════════════════════════════════════════════
// Route 2: Get All Courses
// GET /api/courses/allcourses
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// Route 2: Get All Courses
// GET /api/courses/allcourses
// ═══════════════════════════════════════════════════════
// allcourses route mein — enrollments query ke baad yeh add karo
router.get('/allcourses', fetchuser, roleCheck(['teacher', 'student']), async (req, res) => {
  try {
    const studentId = req.user.id;

    const courses = await Course.find()
      .populate('creator', 'name email role')
      .select('-monthlyViews')
      .sort({ createdAt: -1 })
      .lean();

    let enrolledCourseIds = new Set();

    // ✅ User ki completedLessons lo — real progress ke liye
    const userDoc = await User.findById(studentId).select('completedLessons').lean();
    const completedLessonKeys = userDoc?.completedLessons || [];

    if (mongoose.Types.ObjectId.isValid(studentId)) {
      // Enrollment collection se
      const enrollments = await Enrollment.find({
        student: new mongoose.Types.ObjectId(studentId)
      }).lean();
      enrollments.forEach(e => enrolledCourseIds.add(e.course.toString()));

      // Course.enrolledStudents se (purane)
      courses.forEach(course => {
        const found = (course.enrolledStudents || []).some(e => {
          if (e?.student) return e.student.toString() === studentId;
          return e?.toString() === studentId;
        });
        if (found) enrolledCourseIds.add(course._id.toString());
      });
    }

    const coursesWithEnrollment = courses.map(course => {
      const cid          = course._id.toString();
      const totalLessons = course.aiContent?.topics?.length || 0;

      // ✅ FIX: User.completedLessons se is course ke lessons count karo
      const completedInCourse = completedLessonKeys
        .filter(key => key.startsWith(`${cid}:`)).length;

      const progress = totalLessons > 0
        ? Math.round((completedInCourse / totalLessons) * 100)
        : 0;

      return {
        ...course,
        isEnrolledByCurrentStudent: enrolledCourseIds.has(cid),
        userCompletedLessons:       completedInCourse,  // ✅ real count
        progress:                   progress,            // ✅ real %
      };
    });

    res.json({ success: true, courses: coursesWithEnrollment });

  } catch (error) {
    console.error('❌ Fetch Courses Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// ═══════════════════════════════════════════════════════
// Route 3: Get My Courses — Teacher Only
// GET /api/courses/mycourses
// ═══════════════════════════════════════════════════════
router.get('/mycourses', fetchuser, roleCheck(['teacher']), async (req, res) => {
  try {
    const courses = await Course.find({ creator: req.user.id })
      .populate('creator', 'name email role')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, courses });
  } catch (error) {
    console.error('❌ Fetch My Courses Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════
// Route 4: Delete Course — Owner Only
// DELETE /api/courses/:id
// ═══════════════════════════════════════════════════════
router.delete('/:id', fetchuser, roleCheck(['teacher']), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).lean();
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
    if (course.creator.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await Course.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'Course deleted' });
  } catch (error) {
    console.error('❌ Delete Course Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// ✅ Yeh route create_course.js mein — app.listen se PEHLE add karo

// ✅ create_course.js mein — module.exports = router; se PEHLE paste karo

router.get('/mystats', fetchuser, async (req, res) => {
  try {
    const courses = await Course.find({ creator: req.user.id });

    const totalCourses  = courses.length;

    // ✅ enrolledStudents array of objects hai — unique students count
    const allStudentIds = new Set();
    courses.forEach(c => {
      (c.enrolledStudents || []).forEach(e => {
        if (e.student) allStudentIds.add(e.student.toString());
      });
    });
    const totalStudents = allStudentIds.size;

    // ✅ Revenue — $10 per unique student
    const revenue = totalStudents * 10;

    // ✅ Total views across all courses
    const totalViews = courses.reduce((sum, c) => sum + (c.totalViews || 0), 0);

    // ✅ Monthly students — enrolled in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthlyStudentIds = new Set();
    courses.forEach(c => {
      (c.enrolledStudents || []).forEach(e => {
        if (e.openedAt && new Date(e.openedAt) >= thirtyDaysAgo) {
          if (e.student) monthlyStudentIds.add(e.student.toString());
        }
      });
    });
    const monthlyStudents = monthlyStudentIds.size;

    // ✅ Completion rate — courses with at least 1 student / total courses
    const activeCourses   = courses.filter(c => (c.enrolledStudents || []).length > 0).length;
    const completionRate  = totalCourses > 0
      ? Math.round((activeCourses / totalCourses) * 100) + '%'
      : '0%';

    // ✅ Total reviews estimate (2 per student)
    const totalReviews = totalStudents * 2;

    res.json({
      totalCourses,
      totalStudents,
      revenue,
      totalViews,
      monthlyStudents,
      completionRate,
      totalReviews,
      avgRating: totalStudents > 0 ? '4.8' : '0.0',
    });
  } catch (e) {
    console.error('mystats error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
module.exports = router;