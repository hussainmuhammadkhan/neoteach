const express = require("express");
const router = express.Router();
const axios = require("axios");
const fetchuser = require("../middleware/fetchUser");
const Course = require("../models/CreateCourse");
const QuizModel = require("../models/QuizModel");
const User = require("../models/User");
const Enrollment = require("../models/Enrollment");
const mongoose = require("mongoose");

const PYTORCH_URL = "http://localhost:8000";

router.get("/analyze", fetchuser, async (req, res) => {
  try {
    const studentId = req.user.id;

    // ── Quiz stats ─────────────────────────────────────
    const quizAttempts = await QuizModel.find({
      "attempts.student": studentId,
    });

    let totalScore = 0,
      quizCount = 0,
      maxScore = 0;
    quizAttempts.forEach((q) => {
      q.attempts?.forEach((a) => {
        if (a.student?.toString() === studentId) {
          totalScore += a.score || 0;
          maxScore = Math.max(maxScore, a.score || 0);
          quizCount++;
        }
      });
    });
    const avgScore = quizCount > 0 ? totalScore / quizCount : 0;

    // ── Enrolled courses — DONO jagah se check karo ───
    // 1. Enrollment collection (naye enrollments after fix)
    const enrollmentDocs = await Enrollment.find({
      student: new mongoose.Types.ObjectId(studentId),
    }).lean();

    // 2. Course.enrolledStudents array (purane enrollments)
    const enrolledViaCourse = await Course.find({
      "enrolledStudents.student": new mongoose.Types.ObjectId(studentId),
    }).lean();

    // Dono se unique course IDs
    const enrolledCourseIdSet = new Set([
      ...enrollmentDocs.map((e) => e.course.toString()),
      ...enrolledViaCourse.map((c) => c._id.toString()),
    ]);

    const coursesEnrolled = enrolledCourseIdSet.size;

    // console.log("✅ Badge check — studentId:", studentId);
    // console.log("✅ Enrollment collection:", enrollmentDocs.length);
    // console.log("✅ Course.enrolledStudents:", enrolledViaCourse.length);
    // console.log("✅ Total unique enrolled:", coursesEnrolled);

    // ── Fully completed courses ────────────────────────
    const coursesFullyCompleted = enrollmentDocs.filter(
      (e) => e.isCompleted === true,
    ).length;

    // ── Actual completed lessons from User model ───────
    const userDoc = await User.findById(studentId);
    const completedLessonKeys = userDoc?.completedLessons || [];
    const actualCompletedLessons = completedLessonKeys.length;

    // ── Total lessons available across enrolled courses ─
    const courseIds = [...enrolledCourseIdSet].map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const enrolledCoursesDocs = await Course.find({
      _id: { $in: courseIds },
    }).lean();
    const totalLessonsAvailable = enrolledCoursesDocs.reduce(
      (sum, c) => sum + (c.aiContent?.topics?.length || 0),
      0,
    );

    // ── Leaderboard rank ───────────────────────────────
    const allStudents = await QuizModel.aggregate([
      { $unwind: "$attempts" },
      {
        $group: { _id: "$attempts.student", avg: { $avg: "$attempts.score" } },
      },
      { $sort: { avg: -1 } },
    ]);
    const rankIndex = allStudents.findIndex(
      (s) => s._id?.toString() === studentId,
    );
    const rank = rankIndex >= 0 ? rankIndex + 1 : 999;

    // ── Days active ────────────────────────────────────
    const lessonActivity = userDoc?.lessonActivity || [];
    const uniqueDays = new Set(
      lessonActivity
        .map((a) => a.date?.toISOString?.().split("T")[0])
        .filter(Boolean),
    );
    const daysActive = uniqueDays.size || (actualCompletedLessons > 0 ? 1 : 0);

    // ── Current streak ─────────────────────────────────
    let currentStreak = 0;
if (uniqueDays.size > 0) {
  const sortedDays   = [...uniqueDays].sort().reverse(); // newest first
  const todayStr     = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // ✅ FIX: starting point decide karo
  const startFrom = sortedDays[0] === todayStr
    ? 0   // aaj se shuru
    : sortedDays[0] === yesterdayStr
      ? 1   // kal se shuru (aaj active nahi tha)
      : -1; // zyada purana — streak nahi

  if (startFrom >= 0) {
    for (let i = 0; i < sortedDays.length; i++) {
      const expectedDate = new Date(Date.now() - (startFrom + i) * 86400000)
        .toISOString().split('T')[0];
      if (sortedDays[i] === expectedDate) {
        currentStreak++;
      } else {
        break;
      }
    }
  }
}
   console.log('🔍 uniqueDays:', [...uniqueDays]);
    console.log('🔍 currentStreak:', currentStreak);
    console.log('🔍 lessonActivity length:', lessonActivity.length);
    const studentData = {
      student_id: studentId,
      courses_completed: coursesFullyCompleted,
      courses_enrolled: coursesEnrolled, // ✅ dono sources se
      avg_quiz_score: avgScore,
      max_quiz_score: maxScore,
      current_streak: currentStreak,
      leaderboard_rank: rank,
      total_lessons: totalLessonsAvailable,
      lessons_completed: actualCompletedLessons,
      days_active: daysActive,
      completed_quiz_count: quizCount,
    };

    console.log("🔍 studentData to PyTorch:", JSON.stringify(studentData));

    const response = await axios.post(`${PYTORCH_URL}/analyze`, studentData);
    res.json({
      ...response.data,
      current_streak: currentStreak, // ✅ ADD: Flutter ko bhi bhejo
    });
  } catch (err) {
    console.error("❌ Badge error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});
//const response = await axios.post(`${PYTORCH_URL}/analyze`, studentData);

// GET /api/badges/leaderboard
router.get("/leaderboard", fetchuser, async (req, res) => {
  try {
    const allStudents = await QuizModel.aggregate([
      { $unwind: "$attempts" },
      {
        $group: {
          _id: "$attempts.student",
          avgScore: { $avg: "$attempts.score" },
          quizCount: { $sum: 1 },
        },
      },
      { $sort: { avgScore: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ]);

    const result = allStudents.map((s, i) => ({
      rank: i + 1,
      name: s.user?.name || "Student",
      avgScore: Math.round(s.avgScore || 0),
      quizzes: s.quizCount,
      badge: i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "⭐",
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
