import mongoose from "mongoose";
const waterProcessSchema = new mongoose.Schema({
  dcNo: { type: String, trim: true },
  remarks: { type: String, trim: true },
  openingReading: { type: Number, min: 0 },
  closingReading: { type: Number, min: 0 },
  runningTime: { type: Number, min: 0 },
  startTime: { type: Date },
  endTime: { type: Date },
  status: {
    type: String,
    enum: ["Pending", "Running", "Stopped", "Completed"],
    default: "Pending"
  },
  totalWaterCost: { type: Number, min: 0, default: 0 }
}, { _id: false });
export const Water = mongoose.model("Water", waterProcessSchema);