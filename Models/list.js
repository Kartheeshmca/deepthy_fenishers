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
  machineNo: { type: String, required: true, trim: true },
  receiverNo: { type: String, required: true, trim: true ,unique: true},
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerDetails" },
  date: { type: Date, required: true },             // Admin assigned date
  qty: { type: Number, required: true, min: 0 },
  rate: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, min: 0, default: 0 },
  shiftincharge: { type: [String], required: true,default: [] },
  waterCost: { type: Number, default: 0 },
  runningTime: { type: Number, default: 0 },      // in minutes
  orderNo: { type: Number, required: true },          // Sequence order
  dyes: { type: [dyeSchema], default: [] },
  chemicals: { type: [chemicalSchema], default: [] },
  history: { type: [historySchema], default: [] },
  cycle: { type: Number, default: 1 },
  operator: { type: [String], default: [] },
  status: { type: String, enum: ["Pending","Running","Paused","Reprocess","Stopped","Completed"], default: "Pending" }
}, { timestamps: true });

export default mongoose.model("listProcess", fabricProcessSchema);
