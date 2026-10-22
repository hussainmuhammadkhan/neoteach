const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  student:       { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  course:        { type: mongoose.Schema.Types.ObjectId, ref: "course", required: true },
  teacher:       { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  amount:        { type: Number, required: true },
  paymentMethod: { 
  type: String, 
  enum: ["easypaisa","jazzcash","bank_transfer","sadapay","nayapay","card"], // ✅ card add kiya
  required: true 
},
cardDetails: {
  cardNumber:  { type: String, default: "" }, // sirf last 4 digits save karo
  cardHolder:  { type: String, default: "" },
  expiryMonth: { type: String, default: "" },
  expiryYear:  { type: String, default: "" },
  cardBrand:   { type: String, default: "" }, // "visa" ya "mastercard"
},
  transactionId: { type: String, default: "" },
  senderNumber:  { type: String, default: "" },
  receiptImage:  { type: String, default: "" },  // filename stored in uploads/receipts/
  status:        { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  reviewNote:    { type: String, default: "" },
  reviewedAt:    { type: Date, default: null },
}, { timestamps: true });

PaymentSchema.index({ teacher: 1, status: 1 });
PaymentSchema.index({ student: 1, course: 1 });

module.exports = mongoose.model("payment", PaymentSchema);