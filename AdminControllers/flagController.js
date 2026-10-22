const Flag = require('../models/Admin/Flag');

exports.getFlags = async (req, res) => {
  try {
    const flags = await Flag.find().sort({ date: -1 });
    res.json(flags);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.removeFlag = async (req, res) => {
  try {
    await Flag.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Flag removed" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};