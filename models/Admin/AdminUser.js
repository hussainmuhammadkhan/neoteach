const mongoose = require("mongoose");

const AdminUserSchema = new mongoose.Schema({
    name:   { type: String },
    email:  { type: String },
    role:   { type: String, enum: ["student", "teacher", "admin"], default: "student" },
    status: { type: String, enum: ["active", "pending"], default: "active" },
    joined: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("AdminUser", AdminUserSchema);