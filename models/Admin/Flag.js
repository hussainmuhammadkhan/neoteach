const mongoose = require("mongoose");

const FlagSchema = new mongoose.Schema({
    type:     { type: String },
    title:    { type: String },
    reporter: { type: String },
    reason:   { type: String },
    date:     { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Flag", FlagSchema);