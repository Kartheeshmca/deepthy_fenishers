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

    const operator = await User.findById(req.user.id);
    if (!operator) return res.status(403).json({ message: "Operator not found" });

    const today = new Date();

    // Get today's pending tasks
    const pendingAssigned = operator.assignedFabrics.filter(a => {
      const d = new Date(a.assignedDate);
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear() &&
        a.status === "Pending"
      );
    });

    if (!pendingAssigned.length)
      return res.status(400).json({ message: "No pending tasks for today" });

    // Get fabric details
    const fabricDocs = await FabricProcess.find({
      _id: { $in: pendingAssigned.map(a => a.fabricProcess) },
      status: "Pending"
    });

    const sortedFabrics = fabricDocs.sort((a, b) => a.order - b.order);

    if (sortedFabrics[0].receiverNo !== receiverNo)
      return res.status(400).json({ message: "You must start the first pending task in order" });

    // CREATE WATER DOCUMENT
    const water = new Water({
      receiverNo: sortedFabrics[0].receiverNo,
      openingReading,
      startTime: new Date(),
      status: "Running",
      runningTime: 0,
      history: [
        { action: "Process Started", changes: { openingReading }, user: userName, date: new Date() }
      ]
    });

    await water.save();

    // UPDATE USER TASK
    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": sortedFabrics[0]._id },
      {
        $set: {
          "assignedFabrics.$.status": "Running",
          "assignedFabrics.$.startTime": new Date()
        }
      }
    );

    // 🔥 UPDATE FABRIC PROCESS STATUS
    await FabricProcess.updateOne(
      { _id: sortedFabrics[0]._id },
      { status: "Running" }
    );

    return res.status(201).json({ message: "Water process started", water });

  } catch (error) {
    console.error("Start Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ===========================================================
   PAUSE WATER PROCESS
=========================================================== */
export const pauseWaterProcess = async (req, res) => {
  try {
    const { receiverNo, remarks } = req.body;
    const userName = req.user?.name || "System";

    const operator = await User.findById(req.user.id);
    if (!operator) return res.status(403).json({ message: "Operator not found" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const assignedToday = operator.assignedFabrics
      .filter(a => {
        const d = new Date(a.assignedDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime() && ["Running"].includes(a.status);
      })
      .sort((a, b) => a.order - b.order);

    if (!assignedToday.length)
      return res.status(400).json({ message: "No running tasks to pause" });

    const firstTask = assignedToday[0];

    const fabric = await FabricProcess.findById(firstTask.fabricProcess);

    if (fabric.receiverNo !== receiverNo)
      return res.status(400).json({ message: "Pause only first active task" });

    const water = await Water.findOne({ receiverNo });
    if (!water) return res.status(404).json({ message: "Water record not found" });

    if (water.status !== "Running")
      return res.status(400).json({ message: "Process not running" });

    // Calculate running time
    const now = new Date();
    if (water.startTime)
      water.runningTime += (now - water.startTime) / 1000 / 60;

    water.status = "Paused";
    water.remarks = remarks;

    addWaterHistory(water, "Paused", { runningTime: water.runningTime }, userName);

    await water.save();

    // Update User task
    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": fabric._id },
      { $set: { "assignedFabrics.$.status": "Paused" } }
    );

    // Update Fabric Status
    await FabricProcess.updateOne(
      { _id: fabric._id },
      { status: "Paused" }
    );

    res.status(200).json({ message: "Water process paused", water });

  } catch (error) {
    console.error("Pause Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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

    /* -------------------------------------------------------
       1) Fetch the fabric using receiverNo directly
    -------------------------------------------------------- */
    const cleanInput = receiverNo.replace(/\s+/g, "").toLowerCase();

    const fabric = await FabricProcess.findOne({
      receiverNo: { $regex: new RegExp(`^${receiverNo}$`, "i") }
    });

    if (!fabric)
      return res.status(404).json({ message: "Fabric not found" });

    const cleanFabric = fabric.receiverNo.replace(/\s+/g, "").toLowerCase();

    if (cleanInput !== cleanFabric) {
      return res.status(400).json({
        message: "Receiver number mismatch"
      });
    }

    /* -------------------------------------------------------
       2) Fetch water process
    -------------------------------------------------------- */
    const water = await Water.findOne({ receiverNo: fabric.receiverNo });

    if (!water)
      return res.status(404).json({ message: "Water record not found" });

    /* -------------------------------------------------------
       3) Finalize water process
    -------------------------------------------------------- */
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

    /* -------------------------------------------------------
       4) Update Fabric to Completed
    -------------------------------------------------------- */
    await FabricProcess.updateOne(
      { _id: fabric._id },
      { status: "Completed" }
    );

    return res.status(200).json({
      message: "Water process stopped successfully",
      water
    });

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
    const user = req.user?.name || "Unknown User";

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });

    const customer = await CustomerDetails.findOne({
      receiverNo: water.receiverNo
    });

    if (!customer)
      return res.status(404).json({ message: "Customer details not found" });

    const weight = customer.weight || 1;

    const units = (water.closingReading || 0) - (water.openingReading || 0);

    water.totalWaterCost = Number(((units / weight) * 0.4).toFixed(2));

    addWaterHistory(
      water,
      "Water Cost Calculated",
      { totalWaterCost: water.totalWaterCost },
      user
    );

    await water.save();

    return res.status(200).json({
      message: "Water cost calculated",
      water,
      runningTime: water.runningTime.toFixed(2) + " minutes"
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
