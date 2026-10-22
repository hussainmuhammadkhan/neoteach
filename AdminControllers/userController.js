const User = require('../models/User');

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    //console.log('✅ [Admin] Users fetched:', users.length);
    res.json(users);
  } catch (e) {
    console.error('❌ [Admin] getUsers error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: "User deleted" });
  } catch (e) {
    console.error('❌ [Admin] deleteUser error:', e.message);
    res.status(500).json({ error: e.message });
  }
};