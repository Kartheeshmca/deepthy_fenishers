import mongoose from "mongoose";

const waterProcessSchema = new mongoose.Schema({
  receiverNo: { type: String, trim: true },
  remarks: { type: String, trim: true },
  openingReading: { type: Number, min: 0 },
  closingReading: { type: Number, min: 0 },
  runningTime: { type: Number, min: 0 },
  startTime: { type: Date },
  endTime: { type: Date },
  status: {
    type: String,
    enum: ["Pending", "Running", "Paused", "Completed"],
    default: "Pending"
  },
  totalWaterCost: { type: Number, min: 0, default: 0 },
  date: { 
    type: String, 
    default: () => new Date().toISOString().split('T')[0] 
  },
  time: {
    type: String,
    default: () => new Date().toLocaleTimeString('en-GB', { hour12: false })
  }
});

const Water = mongoose.model("Water", waterProcessSchema);
export default Water; // <- default export
