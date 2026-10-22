const CreateCourse = require('../models/CreateCourse');

exports.getCourses = async (req, res) => {
  try {
    const courses = await CreateCourse.find()
      .sort({ createdAt: -1 });  // ✅ populate hata diya — safer
   // console.log('✅ [Admin] Courses fetched:', courses.length);
    res.json(courses);
  } catch (e) {
    console.error('❌ [Admin] getCourses error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

exports.approveCourse = async (req, res) => {
  try {
    const updated = await CreateCourse.findByIdAndUpdate(
      req.params.id, { status: 'approved' }, { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Course not found' });
    res.json({ success: true, message: "Course approved" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.rejectCourse = async (req, res) => {
  try {
    const updated = await CreateCourse.findByIdAndUpdate(
      req.params.id, { status: 'rejected' }, { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Course not found' });
    res.json({ success: true, message: "Course rejected" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};