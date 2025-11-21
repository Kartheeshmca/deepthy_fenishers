import  Water  from "../Models/Water.js";
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

    const operator = await User.findById(req.user.id).lean();
    if (!operator) return res.status(403).json({ message: "Operator not found" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter pending fabrics for today
    const pendingAssigned = operator.assignedFabrics
      .filter(a => {
        const d = new Date(a.assignedDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime() && a.status === "Pending";
      });

    if (!pendingAssigned.length)
      return res.status(400).json({ message: "No pending tasks for today" });

    const fabricDocs = await FabricProcess.find({
      _id: { $in: pendingAssigned.map(a => a.fabricProcess) },
      status: "Pending"
    }).lean();

    // Sort by order
    const sortedFabrics = fabricDocs.sort((a, b) => a.order - b.order);

    // Only first pending task can start
    if (sortedFabrics[0]._id.toString() !== receiverNo)
      return res.status(400).json({ message: "You must start the first pending task in order" });

    // Create water process
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

    // Update operator's assignedFabrics
    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": receiverNo },
      { $set: { "assignedFabrics.$.status": "Running", "assignedFabrics.$.startTime": new Date() } }
    );

    return res.status(201).json({ message: "Water process started", water });

  } catch (error) {
    console.error("Error starting water process:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ------------------ Pause Water Process ------------------ */
export const pauseWaterProcess = async (req, res) => {
  try {
    const { id, remarks } = req.body;
    const userName = req.user?.name || "System";

    const operator = await User.findById(req.user.id).lean();
    if (!operator) return res.status(403).json({ message: "Operator not found" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Active tasks: Pending/Running/Paused
    const assignedToday = operator.assignedFabrics
      .filter(a => {
        const d = new Date(a.assignedDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime() && ["Pending","Running","Paused"].includes(a.status);
      })
      .sort((a, b) => a.order - b.order);

    if (!assignedToday.length)
      return res.status(400).json({ message: "No tasks for today" });

    const firstTask = assignedToday[0];

    if (firstTask.fabricProcess.toString() !== id)
      return res.status(400).json({ message: "You can only pause the first active task in order" });

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });
    if (water.status !== "Running") return res.status(400).json({ message: "Process not running" });

    // Update running time
    if (water.startTime) {
      const now = new Date();
      water.runningTime = (water.runningTime || 0) + (now - water.startTime) / 1000 / 60;
    }

    water.status = "Paused";
    if (remarks) water.remarks = remarks;

    addWaterHistory(water, "Process Paused", { runningTime: water.runningTime }, userName);
    await water.save();

    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": water._id },
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

    const operator = await User.findById(req.user.id).lean();
    if (!operator) return res.status(403).json({ message: "Operator not found" });

    const today = new Date();
    today.setHours(0,0,0,0);

    // Active tasks: Running/Paused
    const assignedToday = operator.assignedFabrics
      .filter(a => {
        const d = new Date(a.assignedDate);
        d.setHours(0,0,0,0);
        return d.getTime() === today.getTime() && ["Running","Paused"].includes(a.status);
      })
      .sort((a,b) => a.order - b.order);

    if (!assignedToday.length)
      return res.status(400).json({ message: "No active tasks for today" });

    const firstTask = assignedToday[0];

    if (firstTask.fabricProcess.toString() !== id)
      return res.status(400).json({ message: "You can only stop the first active task in order" });

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });

    if (!["Running","Paused"].includes(water.status))
      return res.status(400).json({ message: "Process not running or paused" });

    if (water.startTime) {
      const now = new Date();
      water.runningTime = (water.runningTime || 0) + (now - water.startTime) / 1000 / 60;
    }

    water.status = "Completed";
    water.endTime = new Date();
    water.closingReading = closingReading;

    addWaterHistory(water, "Process Stopped", { closingReading, runningTime: water.runningTime }, userName);
    await water.save();

    await User.updateOne(
      { _id: operator._id, "assignedFabrics.fabricProcess": water._id },
      { $set: { "assignedFabrics.$.status": "Completed", "assignedFabrics.$.endTime": new Date() } }
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
    if (!customer) return res.status(404).json({ message: "Customer details not found" });

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
