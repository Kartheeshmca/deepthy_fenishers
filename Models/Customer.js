import mongoose from "mongoose";

const customerDetailsSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  customerName: { type: String, trim: true },
  receiverNo: { type: String, trim: true, required: true, unique: true },
  partyDcNo: { type: String, trim: true, required: true },
  fabric: { type: String, trim: true },
  color: { type: String, trim: true, required: true },
  dia: { type: String, trim: true },
  roll: { type: Number, min: 0 },
  weight: { type: Number, min: 0, required: true },
fabricStatus: {
    type: String,
    default: "Not Started"
  },
  // ✔ Manual Date Entry
  date: { type: Date, required: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // ✔ Remove default timestamps
  createdAt: { type: Date },
  updatedAt: { type: Date }
});

// Unique DC per company
customerDetailsSchema.index({ companyName: 1, partyDcNo: 1 }, { unique: true });

export default mongoose.model("CustomerDetails", customerDetailsSchema);
