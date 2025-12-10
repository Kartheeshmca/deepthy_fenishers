import mongoose from "mongoose";
const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  changes: { type: Object },
  user: { type: String, default: "System" },
  date: { type: Date, default: Date.now }
}, { _id: false });
const waterProcessSchema = new mongoose.Schema({
  machineNo: { type: String, trim: true },
  receiverNo: { type: String, trim: true },
  remarks: { type: String, trim: true },
  openingReading: { type: Number, min: 0 },
  closingReading: { type: Number, min: 0 },
  runningTime: { type: Number, min: 0 },
  startTime: { type: Date },
  endTime: { type: Date },
  startTimeFormatted: { type: String }, // e.g., "09:00 AM"
  endTimeFormatted: { type: String },   // e.g., "10:00 PM"
  status: {
    type: String,
    enum: ["Pending", "Running", "Paused", "Stopped","Completed"],
    default: "Pending"
  },
  totalWaterCost: { type: Number, min: 0, default: 0 },
  operator: { type: String, default: "" },
  startedBy: { type: String, default: "" },
  history: { type: [historySchema], default: [] },
  date: { 
    type: String, 
    default: () => new Date().toISOString().split('T')[0] 
  },
  time: {
    type: String,
    default: () => new Date().toLocaleTimeString('en-GB', { hour12: false })
  }

}, { timestamps: true });

const Water = mongoose.model("Water", waterProcessSchema);
export default Water; // <- default export
