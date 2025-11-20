import { Water } from "../Models/Water.js";
import FabricProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";
import User from "../Models/User.js";

/* ------------------ Helper: Add History ------------------ */
const addWaterHistory = (water, action, changes = {}, user = "System") => {
  if (!water.history) water.history = [];
  water.history.push({ action, changes, user, date: new Date() });
};

/* ------------------ Start Water Process ------------------ */
export const startWaterProcess = async (req, res) => {
  try {
    const { receiverNo, openingReading } = req.body;
    const userName = req.user?.name || "System";

    const fabric = await FabricProcess.findOne({ receiverNo, status: "Pending" });
    if (!fabric)
      return res.status(400).json({ message: "ReceiverNo invalid or not pending" });

    const operator = await User.findOne({
      _id: req.user.id,
      "assignedFabrics.fabricProcess": fabric._id
    });

    if (!operator)
      return res.status(403).json({ message: "You are not assigned to this fabric process" });

    const water = new Water({
      receiverNo,
      openingReading,
      startTime: new Date(),
      status: "Running",
      runningTime: 0
    });

    addWaterHistory(water, "Process Started", { openingReading }, userName);
    await water.save();

    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": fabric._id },
      {
        $set: {
          "assignedFabrics.$.status": "Running",
          "assignedFabrics.$.startTime": new Date()
        }
      }
    );

    res.status(201).json({ message: "Water process started", water });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ------------------ Pause Water Process ------------------ */
export const pauseWaterProcess = async (req, res) => {
  try {
    const { id, remarks } = req.body;
    const userName = req.user?.name || "System";

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });
    if (water.status !== "Running")
      return res.status(400).json({ message: "Process not running" });

    const fabric = await FabricProcess.findOne({ receiverNo: water.receiverNo });

    const operator = await User.findOne({
      _id: req.user.id,
      "assignedFabrics.fabricProcess": fabric._id
    });

    if (!operator)
      return res.status(403).json({ message: "You are not assigned to this fabric process" });

    if (water.startTime) {
      const now = new Date();
      water.runningTime =
        (water.runningTime || 0) + (now - water.startTime) / 1000 / 60;
    }

    water.status = "Paused";
    if (remarks) water.remarks = remarks;

    addWaterHistory(water, "Process Paused", { runningTime: water.runningTime }, userName);
    await water.save();

    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": fabric._id },
      { $set: { "assignedFabrics.$.status": "Paused" } }
    );

    res.status(200).json({ message: "Water process paused", water });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ------------------ Stop Water Process ------------------ */
export const stopWaterProcess = async (req, res) => {
  try {
    const { id, closingReading } = req.body;
    const userName = req.user?.name || "System";

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });

    if (!["Running", "Paused"].includes(water.status))
      return res.status(400).json({ message: "Process not running or paused" });

    const fabric = await FabricProcess.findOne({ receiverNo: water.receiverNo });

    const operator = await User.findOne({
      _id: req.user.id,
      "assignedFabrics.fabricProcess": fabric._id
    });

    if (!operator)
      return res.status(403).json({ message: "You are not assigned to this fabric process" });

    if (water.startTime) {
      const now = new Date();
      water.runningTime =
        (water.runningTime || 0) + (now - water.startTime) / 1000 / 60;
    }

    water.status = "Completed";
    water.endTime = new Date();
    water.closingReading = closingReading;

    addWaterHistory(
      water,
      "Process Stopped",
      { closingReading, runningTime: water.runningTime },
      userName
    );

    await water.save();

    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": fabric._id },
      {
        $set: {
          "assignedFabrics.$.status": "Completed",
          "assignedFabrics.$.endTime": new Date()
        }
      }
    );

    res.status(200).json({ message: "Water process stopped", water });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ------------------ Calculate Water Cost ------------------ */
export const calculateWaterCost = async (req, res) => {
  try {
    const { id } = req.body;
    const user = req.user?.name || "Unknown User";

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });

    const customer = await CustomerDetails.findOne({ receiverNo: water.receiverNo });
    if (!customer)
      return res.status(404).json({ message: "Customer details not found" });

    const weight = customer.weight || 1;

    const units = water.closingReading - water.openingReading;

    water.totalWaterCost = Number(((units / weight) * 0.4).toFixed(2));

    addWaterHistory(water, "Water Cost Calculated", { totalWaterCost: water.totalWaterCost }, user);

    await water.save();

    res.status(200).json({
      message: "Water cost calculated",
      water,
      runningTime: water.runningTime.toFixed(2) + " minutes"
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
