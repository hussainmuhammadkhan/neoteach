const mongoose = require("mongoose");
const { Schema } = mongoose;

if (mongoose.models["user"]) {
  module.exports = mongoose.models["user"];
} else {
  const UserSchema = new Schema(
    {
      fcmToken: { type: String, default: "" },
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
        unique: true,
      },
      password: {
        type: String,
        required: true,
      },
      role: {
        type: String,
        enum: ["student", "teacher"],
        required: true,
      },
      completedLessons: { type: [String], default: [] },
      lessonActivity: [
        {
          lessonKey: { type: String },
          date: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      recentCourses: [
        {
          courseId: String,
          courseName: String,
          openedAt: Date,
          _id: false,
        },
      ],
      watchHistory: [
        {
          videoId: { type: String },
          title: { type: String },
          thumbnail: { type: String },
          progress: { type: Number, default: 0 },
          watchedAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],

      paymentMethods: [
        {
          type: {
            type: String,
            enum: [
              "easypaisa",
              "jazzcash",
              "bank_transfer",
              "sadapay",
              "nayapay",
            ],
          },
          accountNumber: { type: String },
          accountTitle: { type: String, default: "" },
          bankName: { type: String, default: "" },
          isPrimary: { type: Boolean, default: false },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      resetPasswordToken:  { type: String,  default: null },
      resetPasswordExpire: { type: Date,    default: null },
    },
    { timestamps: true },
  ); // ✅ yeh add kiya — createdAt aur updatedAt auto banega

  module.exports = mongoose.model("user", UserSchema);
}
