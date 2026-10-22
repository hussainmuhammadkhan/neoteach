const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProfileUserSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true,
    unique: true
  },

  phone:    { type: String, default: '' },
  location: { type: String, default: '' },
  avatar:   { type: String, default: '' },  // ✅ stores upload path
  bio:      { type: String, default: 'Passionate learner exploring AI and web development.' },

  level:  { type: Number, default: 1 },
  streak: { type: Number, default: 0 },

  // ✅ Settings — extended
  notifications: { type: Boolean, default: true  },
  darkMode:      { type: Boolean, default: false  },
  emailUpdates:  { type: Boolean, default: true   }, // ✅ new
  twoFactor:     { type: Boolean, default: false  }, // ✅ new
  language:      { type: String,  default: 'English' }, // ✅ new

}, { timestamps: true });

module.exports = mongoose.model('profile_user', ProfileUserSchema);