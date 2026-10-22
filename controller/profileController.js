const ProfileUser = require("../models/ProfileUser");

// Get profile for logged-in user
exports.getProfile = async (req, res) => {
  try {
    const profile = await ProfileUser.findOne({ userId: req.user.id });

    if (!profile) {
      return res.json({
        message: "Profile not found, creating default",
        profile: null
      });
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Create or Update profile
exports.updateProfile = async (req, res) => {
  try {
    const data = req.body;

    const updatedProfile = await ProfileUser.findOneAndUpdate(
      { userId: req.user.id },
      { $set: data },
      { new: true, upsert: true }
    );

    res.json({
      message: "Profile updated successfully",
      profile: updatedProfile
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
