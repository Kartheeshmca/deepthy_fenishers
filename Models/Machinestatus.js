import mongoose from "mongoose";

const machineStatusSchema = new mongoose.Schema({
  machineNo: { type: String, required: true, unique: true },
  lastStatus: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("MachineStatus", machineStatusSchema);
