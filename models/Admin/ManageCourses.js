const mongoose = require("mongoose");

const ManageCourseSchema = new mongoose.Schema({
    title:    { type: String },
    teacher:  { type: String },
    students: { type: Number, default: 0 },
    status:   { type: String, enum: ["approved", "pending", "rejected"], default: "pending" },
}, { timestamps: true });

module.exports = mongoose.model("ManageCourse", ManageCourseSchema);