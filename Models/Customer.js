import mongoose from "mongoose";

const customerDetailsSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  customerName: { type: String, trim: true },
  receiverNo: { type: String, trim: true, unique: true },
  fabric: { type: String, trim: true },
  color: { type: String, trim: true },
  dia: { type: String, trim: true },
  roll: { type: Number, min: 0 },
  weight: { type: Number, min: 0 },
  partyDcNo: { type: String, trim: true },
  date: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Unique DC per company
customerDetailsSchema.index({ companyName: 1, partyDcNo: 1 }, { unique: true });

export default mongoose.model("CustomerDetails", customerDetailsSchema);
