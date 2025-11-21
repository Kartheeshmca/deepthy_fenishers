import mongoose from "mongoose";

const chemicalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 }
}, { _id: false });

const dyeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 }
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  changes: { type: Object },
  date: { type: Date, default: Date.now },
  user: { type: String, default: "System" }
}, { _id: false });

const fabricProcessSchema = new mongoose.Schema({
  receiverNo: { type: String, required: true, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerDetails" },
  date: { type: Date, required: true },             // Admin assigned date
  qty: { type: Number, required: true, min: 0 },
  machineNo: { type: String, required: true, trim: true },
  rate: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, min: 0, default: 0 },
  shiftIncharge: { type: String, required: true },
  operator: { type: String, required: true },
  order: { type: Number, required: true },          // Sequence order
  dyes: { type: [dyeSchema], default: [] },
  chemicals: { type: [chemicalSchema], default: [] },
  history: { type: [historySchema], default: [] },
  cycle: { type: Number, default: 1 },
  status: { type: String, enum: ["Pending","Running","Paused","Completed"], default: "Pending" }
}, { timestamps: true });

export default mongoose.model("listProcess", fabricProcessSchema);
