import mongoose from "mongoose";

/* -----------------------------
   CHEMICALS
------------------------------*/
const chemicalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

/* -----------------------------
   DYES
------------------------------*/
const dyeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 },
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

/* -----------------------------
   HISTORY LOG
------------------------------*/
const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  changes: { type: Object },
  user: { type: String, default: "System" },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

/* -----------------------------
   CUSTOMER DETAILS
------------------------------*/

/* -----------------------------
   WATER PROCESS
------------------------------*/

/* -----------------------------   MAIN FABRIC PROCESS
------------------------------*/
const fabricProcessSchema = new mongoose.Schema({
  dcNo: { type: String, required: true, trim: true },
  cycle: { type: Number, default: 1 },
  date: { type: Date, default: Date.now },
  // customerDetails: customerDetailsSchema,
  qty: { type: Number, required: true, min: 0 },
  machineNo: { type: String, required: true, trim: true },
  // waterProcess: waterProcessSchema,
  chemical: [chemicalSchema],
  dyes: [dyeSchema],
  rate: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, min: 0, default: 0 },
  lotWeight: { type: Number, min: 0 },
  status: {
    type: String,
    enum: ["Pending", "Running", "Paused", "Completed"],
    default: "Pending"
  },
  history: [historySchema]
}, { timestamps: true });

fabricProcessSchema.index({ dcNo: 1, cycle: 1 }, { unique: true });

export default mongoose.model("listProcess", fabricProcessSchema);
