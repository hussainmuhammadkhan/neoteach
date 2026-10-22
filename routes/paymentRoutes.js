const express   = require("express");
const router    = express.Router();
const multer    = require("multer");
const path      = require("path");
const fs        = require("fs");
const fetchUser = require("../middleware/fetchUser");
const Payment   = require("../models/Payment");
const Course    = require("../models/CreateCourse");
const User      = require("../models/User");
const Enrollment = require('../models/Enrollment');

// ── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/receipts";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `receipt_${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg","image/png","image/jpg","image/webp","application/pdf"];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only image/PDF allowed"));
  },
});

// ════════════════════════════════════════════════════════════
// POST /api/payments/submit-receipt
// ════════════════════════════════════════════════════════════
router.post("/submit-receipt", fetchUser, (req, res, next) => {
  upload.single("receipt")(req, res, (err) => {
    if (err && req.body?.paymentMethod !== 'card') {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { 
      courseId, paymentMethod, transactionId, amount, senderNumber,
      cardNumber, cardHolder, expiryMonth, expiryYear, cardBrand  // ✅ new fields
    } = req.body;

    if (!courseId || !paymentMethod) {
      return res.status(400).json({ success: false, error: "Please send the corseId and payment method" });
    }
    // ✅ Naya — card ke liye receipt optional
if (!req.file && paymentMethod !== 'card') {
  return res.status(400).json({ success: false, error: "Please upload the receipt image." });
}
    if (!req.file && paymentMethod !== 'card') {
      return res.status(400).json({ success: false, error: "Please upload the receipt image." });
    }
    const course = await Course.findById(courseId).lean();
    if (!course) return res.status(404).json({ success: false, error: "Course not found." });

    // 🔑 KEY FIX: Try all possible teacher field names
    const teacherId =
      course.creator     ||
      course.instructor  ||
      course.teacher     ||
      course.createdBy   ||
      null;

    // Debug log — server console mein dekho ye
    // console.log("📦 [submit-receipt] Course teacher detection:", {
    //   courseId:   course._id,
    //   title:      course.title,
    //   creator:    course.creator,
    //   instructor: course.instructor,
    //   teacher:    course.teacher,
    //   createdBy:  course.createdBy,
    //   resolved:   teacherId,
    // });

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        error: "Teacher ID not found. Check the Creator/Instructor field in the Course model.",
      });
    }

    // Duplicate pending check
    const existing = await Payment.findOne({ student: req.user.id, course: courseId, status: "pending" });
    if (existing) {
      return res.status(400).json({ success: false, error: "Payment for this course is already pending" });
    }

    // Already enrolled check
    const enrolledList = course.enrolledStudents || [];
    const alreadyEnrolled = enrolledList.some(
      (e) => (e?.student?.toString() || e?.toString()) === req.user.id
    );
    if (alreadyEnrolled) {
      return res.status(400).json({ success: false, error: "You are already enrolled." });
    }

    const payment = await Payment.create({
      student:       req.user.id,
      course:        courseId,
      teacher:       teacherId,
      amount:        parseFloat(amount) || course.price || 0,
      paymentMethod,
      transactionId: transactionId || "",
      senderNumber:  senderNumber  || "",
      receiptImage:  req.file ? req.file.filename : "",
       status:        paymentMethod === 'card' ? "approved" : "pending",
       cardDetails: paymentMethod === 'card' ? {
      cardNumber:  (cardNumber || "").slice(-4),  // sirf last 4 digits
      cardHolder:  cardHolder  || "",
      expiryMonth: expiryMonth || "",
      expiryYear:  expiryYear  || "",
      cardBrand:   cardBrand   || "visa",
    } : {},
    });
   // submit-receipt route mein — card payment block replace karo
if (paymentMethod === 'card') {
  await Course.findByIdAndUpdate(payment.course, {
    $addToSet: { enrolledStudents: { student: payment.student, enrolledAt: new Date() } }
  });

  // ✅ FIX: Enrollment collection mein bhi save karo
  await Enrollment.findOneAndUpdate(
    { student: payment.student, course: payment.course },
    {
      student:    payment.student,
      course:     payment.course,
      payment:    payment._id,
      enrolledAt: new Date(),
    },
    { upsert: true, new: true }
  );
}
    // console.log("✅ [submit-receipt] Payment saved:", {
    //   _id: payment._id, teacher: payment.teacher, receipt: payment.receiptImage
    // });

    res.status(201).json({ success: true, message: "Payment submitted! Teacher will approve.", data: payment });
  } catch (err) {
    console.error("❌ [submit-receipt]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/payments/my-payments  — Student
// ════════════════════════════════════════════════════════════
router.get("/my-payments", fetchUser, async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.user.id })
      .populate("course",  "title thumbnail price isPremium")
      .populate("teacher", "name email")
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/payments/receipts/pending  — Teacher
// ════════════════════════════════════════════════════════════
router.get("/receipts/pending", fetchUser, async (req, res) => {
  try {
    //console.log("👀 [receipts/pending] Teacher lookup:", req.user.id);
    const payments = await Payment.find({ teacher: req.user.id, status: "pending" })
      .populate("student", "name email")
      .populate("course",  "title price")
      .sort({ createdAt: -1 }).lean();
    //console.log("📋 [receipts/pending] Count:", payments.length);
    res.json({ success: true, data: payments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/payments/receipts/all  — Teacher
// ════════════════════════════════════════════════════════════
router.get("/receipts/all", fetchUser, async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 20 } = req.query;
    const filter = { teacher: req.user.id };
    if (status !== "all") filter.status = status;
    const payments = await Payment.find(filter)
      .populate("student", "name email")
      .populate("course",  "title price")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)).lean();
    const total = await Payment.countDocuments(filter);
    res.json({ success: true, data: payments, total });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PUT /api/payments/receipts/:id/approve  — Teacher
// ════════════════════════════════════════════════════════════
// ✅ Top pe add karo


// ════════════════════════════════════════════════════
// PUT /api/payments/receipts/:id/approve — Teacher
// ════════════════════════════════════════════════════
router.put("/receipts/:id/approve", fetchUser, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: "Payment not found." });
    if (payment.teacher.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Not Authorized!" });

    payment.status     = "approved";
    payment.reviewNote = req.body.note || "";
    payment.reviewedAt = new Date();
    await payment.save();

    // ✅ Course enrolledStudents array update (purana code)
    await Course.findByIdAndUpdate(payment.course, {
      $addToSet: { enrolledStudents: { student: payment.student, enrolledAt: new Date() } }
    });

    // ✅ FIX: Enrollment collection mein bhi save karo
    await Enrollment.findOneAndUpdate(
      { student: payment.student, course: payment.course },
      {
        student:    payment.student,
        course:     payment.course,
        payment:    payment._id,
        enrolledAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Approved – Student Enrolled!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PUT /api/payments/receipts/:id/reject  — Teacher
// ════════════════════════════════════════════════════════════
router.put("/receipts/:id/reject", fetchUser, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: "Payment not found" });
    if (payment.teacher.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Not Authorized!" });

    payment.status = "rejected";
    payment.reviewNote = req.body.reason || "";
    payment.reviewedAt = new Date();
    await payment.save();
    res.json({ success: true, message: "Rejected." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/payments/earnings  — Teacher
// ════════════════════════════════════════════════════════════
router.get("/earnings", fetchUser, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const allApproved = await Payment.find({ teacher: req.user.id, status: "approved" }).lean();
    const thisMonth   = allApproved.filter(p => new Date(p.createdAt) >= startOfMonth);
    const total   = allApproved.reduce((s, p) => s + (p.amount || 0), 0);
    const monthly = thisMonth.reduce((s, p) => s + (p.amount || 0), 0);
    const pendingPayments = await Payment.find({ teacher: req.user.id, status: "pending" }).lean();
    const pending = pendingPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const transactions = await Payment.find({ teacher: req.user.id })
      .populate("student", "name email")
      .populate("course",  "title price")
      .sort({ createdAt: -1 }).limit(20).lean();
    res.json({
      success: true,
      data: {
        total:     parseFloat(total.toFixed(2)),
        thisMonth: parseFloat(monthly.toFixed(2)),
        pending:   parseFloat(pending.toFixed(2)),
        available: parseFloat((total * 0.9).toFixed(2)),
        transactions,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/payments/my-courses  — Teacher
// ════════════════════════════════════════════════════════════
router.get("/my-courses", fetchUser, async (req, res) => {
  try {
    // 🔑 KEY FIX: Try all possible owner field names
    const courses = await Course.find({
      $or: [
        { creator:    req.user.id },
        { instructor: req.user.id },
        { teacher:    req.user.id },
        { createdBy:  req.user.id },
      ]
    })
      .select("Title thumbnail price isPremium enrolledStudents createdAt creator instructor")
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PUT /api/payments/courses/:courseId/premium  — Teacher
// ════════════════════════════════════════════════════════════
router.put("/courses/:courseId/premium", fetchUser, async (req, res) => {
  try {
    const { isPremium, price } = req.body;
    // 🔑 KEY FIX: Try all owner fields
    const course = await Course.findOne({
      _id: req.params.courseId,
      $or: [
        { creator:    req.user.id },
        { instructor: req.user.id },
        { teacher:    req.user.id },
        { createdBy:  req.user.id },
      ]
    });
    if (!course) return res.status(404).json({ success: false, error: "Course not found." });
    course.isPremium = isPremium;
    course.price     = parseFloat(price) || 0;
    await course.save();
    res.json({ success: true, message: isPremium ? `Premium — PKR ${price}` : "Became free" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// Payment Methods CRUD
// ════════════════════════════════════════════════════════════
router.get("/methods", fetchUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("paymentMethods").lean();
    res.json({ success: true, data: user?.paymentMethods || [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/methods", fetchUser, async (req, res) => {
  try {
    const { type, accountNumber, accountTitle, bankName } = req.body;
    if (!type || !accountNumber)
      return res.status(400).json({ error: "Type and account number are required" });
    const user = await User.findById(req.user.id);
    user.paymentMethods.push({
      type, accountNumber,
      accountTitle: accountTitle || "",
      bankName:     bankName     || "",
      isPrimary:    user.paymentMethods.length === 0,
      addedAt:      new Date(),
    });
    await user.save();
    res.json({ success: true, data: user.paymentMethods.at(-1) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete("/methods/:methodId", fetchUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.paymentMethods = user.paymentMethods.filter(
      (m) => m._id.toString() !== req.params.methodId
    );
    await user.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// GET /api/payments/receipt-image/:filename
// ════════════════════════════════════════════════════════════
router.get("/receipt-image/:filename", fetchUser, (req, res) => {
  const filePath = path.join(__dirname, "../uploads/receipts", req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Image not found." });
  res.sendFile(path.resolve(filePath));
});

module.exports = router;