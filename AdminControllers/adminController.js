const User         = require('../models/User');
const CreateCourse = require('../models/CreateCourse');
const Flag         = require('../models/Admin/Flag');
const Payment      = require('../models/Payment');

exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers     = await User.countDocuments();
    const totalCourses   = await CreateCourse.countDocuments();
    const activeCourses  = await CreateCourse.countDocuments({ status: 'approved' });
    const pendingCourses = await CreateCourse.countDocuments({ status: 'pending' });
    const totalFlags     = await Flag.countDocuments();

    const currentYear = new Date().getFullYear();

    // ✅ Daily signups — last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const signupsRaw = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Last 30 days ki dates banao — missing dates 0 hongi
    const dailySignups = [];
    const dailyLabels  = [];
    for (let i = 29; i >= 0; i--) {
      const d    = new Date();
      d.setDate(d.getDate() - i);
      const key  = d.toISOString().substring(0, 10);
      const found = signupsRaw.find(s => s._id === key);
      dailySignups.push(found ? found.count : 0);
      dailyLabels.push(d.getDate().toString());
    }

    // ✅ Platform earnings — approved payments ka 10%
    const payments = await Payment.find({ status: 'approved' })
      .select('amount createdAt');

    let platformEarnings = 0;
    const monthlyEarnings = Array(12).fill(0);

    payments.forEach(p => {
      const cut  = Math.floor((p.amount || 0) * 0.10);
      platformEarnings += cut;
      const date = new Date(p.createdAt);
      if (date.getFullYear() === currentYear) {
        monthlyEarnings[date.getMonth()] += cut;
      }
    });

    // console.log('✅ [Admin] Stats:', {
    //   totalUsers, totalCourses, pendingCourses,
    //   platformEarnings, totalPayments: payments.length,
    //   dailySignups
    // });

    res.json({
      totalUsers,
      totalCourses,
      activeCourses,
      pendingCourses,
      totalFlags,
      dailySignups,       // ✅ [0,0,2,1,...] 30 values
      dailyLabels,        // ✅ ["1","2",...,"30"]
      platformEarnings,
      monthlyEarnings,
    });
  } catch (e) {
    console.error('❌ [Admin] Stats error:', e.message);
    res.status(500).json({ error: e.message });
  }
};