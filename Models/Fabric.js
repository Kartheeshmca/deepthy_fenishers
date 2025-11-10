import mongoose from "mongoose";

// Chemicals schema
const chemicalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 }
}, { _id: false });

// Dyes schema
const dyeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 }
}, { _id: false });

// History schema
const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  changes: { type: Object },
  date: { type: Date, default: Date.now },
  user: { type: String, default: "System" }
}, { _id: false });

// Fabric Process schema
const fabricProcessSchema = new mongoose.Schema({
  dcNo: { type: String, required: true, trim: true },
  cycle: { type: Number, default: 1 }, // ✅ Added
  date: { type: Date, default: Date.now },
  brandName: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0 },
  color: { type: String, required: true, trim: true },
  machineNo: { type: String, required: true, trim: true },
  chemical: [chemicalSchema],
  dyes: [dyeSchema],
  rate: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, min: 0, default: 0 },
  A_D: { type: String, trim: true },
  startTime: { type: Date },
  endTime: { type: Date },
  runningTime: { type: Number, min: 0 }, // hours
  openingReading: { type: Number, min: 0 },
  closingReading: { type: Number, min: 0 },
  lotWeight: { type: Number, min: 0 },
  waterCost: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["Pending", "Running", "Completed"], default: "Pending" },
  history: [historySchema]
}, { timestamps: true });

// ✅ Ensure unique combination of dcNo + cycle
fabricProcessSchema.index({ dcNo: 1, cycle: 1 }, { unique: true });

export default mongoose.model("FabricProcess", fabricProcessSchema);
