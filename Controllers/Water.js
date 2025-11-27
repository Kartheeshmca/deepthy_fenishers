import Water from "../Models/Water.js";
import FabricProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";

/* -----------------------------------------------------
   Helper: Add History Entry
----------------------------------------------------- */
const addWaterHistory = (water, action, changes = {}, user = "System") => {
  if (!water.history) water.history = [];
  water.history.push({
    action,
    changes,
    user,
    date: new Date()
  });
};

/* =====================================================
   START WATER PROCESS
===================================================== */
export const startWaterProcess = async (req, res) => {
  try {
    const { receiverNo, openingReading } = req.body;
    const userName = req.user?.name || "System";

    if (!receiverNo) {
      return res.status(400).json({ message: "receiverNo is required" });
    }

    // Only start if fabric is in Pending state
    const fabric = await FabricProcess.findOne({
      receiverNo,
      status: "Pending"
    });

    if (!fabric) {
      return res.status(404).json({
        message: "No pending task found for this receiverNo"
      });
    }

    // Create Water Process
    const water = await Water.create({
      receiverNo,
      openingReading,
      startTime: new Date(),
      status: "Running",
      runningTime: 0,
      startedBy: userName,
      operator: userName,   // Store Operator Here
      history: [
        {
          action: "Process Started",
          changes: { openingReading },
          user: userName,
          date: new Date()
        }
      ]
    });

    // Update Fabric Process
    await FabricProcess.updateOne(
      { _id: fabric._id },
      {
        status: "Running",
        operator: userName   // Also store operator here ✨
      }
    );

    return res.status(201).json({
      message: "Water process started successfully",
      water,
      fabric
    });

  } catch (error) {
    console.error("START ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* =====================================================
   PAUSE WATER PROCESS
===================================================== */
export const pauseWaterProcess = async (req, res) => {
  try {
    const { id } = req.params; // <-- use ID from URL
    const { remarks } = req.body;
    const userName = req.user?.name || "System";

    // Find water process by ID
    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water record not found" });

    /* -----------------------------------------------------
       CASE 1: PROCESS IS RUNNING → PAUSE IT
    ----------------------------------------------------- */
    if (water.status === "Running") {
      const now = new Date();

      // Add running time until now
      if (water.startTime) {
        water.runningTime += (now - new Date(water.startTime)) / 60000;
        water.runningTime = Number(water.runningTime.toFixed(2));
      }

      // Update to Paused
      water.status = "Paused";
      water.startTime = null;
      water.remarks = remarks;

      addWaterHistory(
        water,
        "Paused",
        { runningTime: water.runningTime, remarks },
        userName
      );

      await water.save();

      // Optionally, update related FabricProcess by receiverNo
      if (water.receiverNo) {
        await FabricProcess.updateOne({ receiverNo: water.receiverNo }, { status: "Paused" });
      }

      return res.status(200).json({
        message: "Water process paused",
        water
      });
    }

    /* -----------------------------------------------------
       CASE 2: PROCESS IS PAUSED → RESUME IT
    ----------------------------------------------------- */
    if (water.status === "Paused") {
      water.startTime = new Date();
      water.status = "Running";
      water.remarks = remarks;

      addWaterHistory(
        water,
        "Resumed",
        { remarks },
        userName
      );

      await water.save();

      // Optionally, update related FabricProcess by receiverNo
      if (water.receiverNo) {
        await FabricProcess.updateOne({ receiverNo: water.receiverNo }, { status: "Running" });
      }

      return res.status(200).json({
        message: "Water process resumed",
        water
      });
    }

    /* -----------------------------------------------------
       IF OTHER STATUS
    ----------------------------------------------------- */
    return res.status(400).json({
      message: `Cannot toggle when status is ${water.status}`
    });

  } catch (error) {
    console.error("TOGGLE ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* =====================================================
   STOP WATER PROCESS
===================================================== */
export const stopWaterProcess = async (req, res) => {
  try {
    const { id } = req.params; // <-- get water process ID from URL
    const { closingReading } = req.body;
    const userName = req.user?.name || "System";

    // Find water process by ID (must be Running or Paused)
    const water = await Water.findOne({
      _id: id,
      status: { $in: ["Running", "Paused"] }
    });

    if (!water) return res.status(404).json({ message: "Water record not found" });

    const now = new Date();

    // Update running time if process was running
    if (water.startTime) {
      water.runningTime += (now - new Date(water.startTime)) / 60000;
      water.runningTime = Number(water.runningTime.toFixed(2));
    }

    // Stop the process
    water.status = "Freezed"; // or "Completed" if you prefer
    water.endTime = now;
    water.closingReading = closingReading;

    addWaterHistory(
      water,
      "Freezed",
      { closingReading, runningTime: water.runningTime },
      userName
    );

    await water.save();

    // Optionally, update related FabricProcess by receiverNo
    if (water.receiverNo) {
      await FabricProcess.updateOne(
        { receiverNo: water.receiverNo },
        { status: "Freezed" }
      );
    }

    return res.status(200).json({
      message: "Water process stopped successfully",
      water
    });

  } catch (error) {
    console.error("STOP ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


/* =====================================================
   CALCULATE WATER COST
===================================================== */
export const calculateWaterCost = async (req, res) => {
  try {
    const { id } = req.body;
    const userName = req.user?.name || "Unknown";

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });

    const customer = await CustomerDetails.findOne({
      receiverNo: water.receiverNo
    });

    if (!customer)
      return res.status(404).json({ message: "Customer details not found" });

    const weight = customer.weight || 1;
    const units = (water.closingReading || 0) - (water.openingReading || 0);

    let cost = Number(((units / weight) * 0.4).toFixed(2));
    if (isNaN(cost) || cost < 0) cost = 0;

    water.totalWaterCost = cost;

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
    console.error("COST ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
