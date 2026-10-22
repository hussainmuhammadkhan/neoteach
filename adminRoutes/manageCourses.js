const express = require("express");
const router  = express.Router();
const CreateCourse = require('../models/CreateCourse');

// ✅ GET all courses — no status filter, admin sees everything
router.get("/", async (req, res) => {
  try {
    const courses = await CreateCourse.find().populate('creator', 'name email').sort({ createdAt: -1 });
    //console.log('✅ [Admin] Courses fetched:', courses.length);
    res.json(courses);
  } catch (e) {
    console.error('❌ [Admin] getCourses error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/approve/:id", async (req, res) => {
  try {
    await CreateCourse.findByIdAndUpdate(req.params.id, { status: 'approved' });
    res.json({ success: true, message: "Course approved" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/reject/:id", async (req, res) => {
  try {
    await CreateCourse.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.json({ success: true, message: "Course rejected" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;