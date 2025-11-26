import Water from "../Models/Water.js";
import FabricProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";
import User from "../Models/User.js";

/* ------------------ Helper: Add History ------------------ */
const addWaterHistory = (water, action, changes = {}, user = "System") => {
  if (!water.history) water.history = [];
  water.history.push({ action, changes, user, date: new Date() });
};

/* ===========================================================
   START WATER PROCESS
=========================================================== */
export const startWaterProcess = async (req, res) => {
  try {
    const { receiverNo, openingReading } = req.body;
    const userName = req.user?.name || "System";

    if (!receiverNo)
      return res.status(400).json({ message: "receiverNo is required" });

    // 1) Find the task only by receiverNo
    const task = await FabricProcess.findOne({
      receiverNo: receiverNo,
      status: "Pending"
    });

    if (!task)
      return res.status(400).json({
        message: "No pending task found for this receiverNo"
      });

    // 3) Create water process
    const water = await Water.create({
      receiverNo: task.receiverNo,
      openingReading,
      startTime: new Date(),
      status: "Running",
      runningTime: 0,
      startedBy: userName,
      history: [
        {
          action: "Process Started",
          changes: { openingReading },
          user: userName,
          date: new Date()
        }
      ]
    });

    // 4) Update fabric process status
    await FabricProcess.updateOne(
      { _id: task._id },
      {
        status: "Running",
        operator: userName // optional — remove if you don't want to track operator
      }
    );

    return res.status(201).json({
      message: "Water process started successfully",
      water,
      startedTask: task
    });

  } catch (error) {
    console.error("Start Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};
/* ===========================================================
   PAUSE WATER PROCESS
=========================================================== */
export const pauseWaterProcess = async (req, res) => {
  try {
    const { receiverNo, remarks } = req.body;
    const userName = req.user?.name || "System"; // operator performing action

    const water = await Water.findOne({ receiverNo });
    if (!water) return res.status(404).json({ message: "Water record not found" });

    if (water.status !== "Running")
      return res.status(400).json({ message: "Process is not Running" });

    // Calculate running time
    const now = new Date();
    if (water.startTime)
      water.runningTime += (now - water.startTime) / 1000 / 60;

    water.status = "Paused";
    water.remarks = remarks;

    addWaterHistory(water, "Paused", { runningTime: water.runningTime }, userName);

    await water.save();

    // Update Fabric status only
    await FabricProcess.updateOne(
      { receiverNo },
      { status: "Paused" }
    );

    return res.status(200).json({ message: "Water process paused", water });

  } catch (error) {
    console.error("Pause Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ===========================================================
   STOP WATER PROCESS
=========================================================== */
/* ===========================================================
   STOP WATER PROCESS  (FINAL FIXED VERSION)
=========================================================== */
export const stopWaterProcess = async (req, res) => {
  try {
    const { receiverNo, closingReading } = req.body;
    const userName = req.user?.name || "System";

    const fabric = await FabricProcess.findOne({
      receiverNo: { $regex: new RegExp(`^${receiverNo}$`, "i") }
    });

    if (!fabric) return res.status(404).json({ message: "Fabric not found" });

    const water = await Water.findOne({ receiverNo: fabric.receiverNo });
    if (!water) return res.status(404).json({ message: "Water record not found" });

    const now = new Date();
    if (water.startTime)
      water.runningTime += (now - water.startTime) / 1000 / 60;

    water.status = "Completed";
    water.endTime = now;
    water.closingReading = closingReading;

    addWaterHistory(
      water,
      "Completed",
      { closingReading, runningTime: water.runningTime },
      userName
    );

    await water.save();

    // Update Fabric status only
    await FabricProcess.updateOne(
      { _id: fabric._id },
      { status: "Completed" }
    );

    return res.status(200).json({ message: "Water process stopped successfully", water });

  } catch (error) {
    console.error("STOP ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ============================================================
   CALCULATE WATER COST
============================================================ */
export const calculateWaterCost = async (req, res) => {
  try {
    const { id } = req.body;
    const userName = req.user?.name || "Unknown User";

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });

    const customer = await CustomerDetails.findOne({ receiverNo: water.receiverNo });
    if (!customer) return res.status(404).json({ message: "Customer details not found" });

    const weight = customer.weight || 1;
    const units = (water.closingReading || 0) - (water.openingReading || 0);
    water.totalWaterCost = Number(((units / weight) * 0.4).toFixed(2));

    addWaterHistory(
      water,
      "Water Cost Calculated",
      { totalWaterCost: water.totalWaterCost },
      userName
    );

    await water.save();

    return res.status(200).json({
      message: "Water cost calculated",
      water,
      runningTime: water.runningTime.toFixed(2) + " minutes"
    });

  } catch (error) {
    console.error("Cost Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
