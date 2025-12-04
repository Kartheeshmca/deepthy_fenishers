import Water from "../Models/Water.js";
import listProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";

import { sendWhatsApp } from "../Utils/twilio.js";
import { owners } from "../Config/owners.js";
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

// Convert any date to 00:00 India local date


// Convert timestamp to India format
const toIST = (date) => {
  return new Date(date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
};

const formatTime = (date) => {
  return new Date(date)
    .toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata"
    });
};

const notifyOwners = async (water, customer, action) => {
  const actionConfig = {
    "Running": { emoji: "🟢" },
    "Paused": { emoji: "🟡" },
    "Resumed": { emoji: "🔵" },
    "Stopped": { emoji: "🔴" },
    "Completed": { emoji: "✅" }
  };

  const config = actionConfig[action] || { emoji: "⚪" };

  let message = `
 *MACHINE STATUS* 
${config.emoji} *${action}* ${config.emoji}

📊 *MACHINE INFORMATION*
┌────────────────────────────
│  Machine-No: ${water.receiverNo}
│  Status: ${action}
│  Operator: ${water.operator || "Unknown"}
└────────────────────────────
  `;
  /* TIME FOR RUNNING / PAUSED / RESUMED */
  if (["Running", "Paused", "Resumed"].includes(action)) {
    message += `
⏰ *TIMING*
┌────────────────────────────
│  Machine Started: ${water.startTimeFormatted || "-"}
└────────────────────────────
    `;
  }
  /* TIME FOR STOPPED / COMPLETED */
  if (["Stopped", "Completed"].includes(action)) {
    message += `
⏰ *TIMING*
┌────────────────────────────
│  Start Time : ${water.startTimeFormatted || "-"}
│  End Time   : ${water.endTimeFormatted || "-"}
└────────────────────────────
    `;
  }
  /* CUSTOMER DETAILS */
  message += `
👥 *CUSTOMER DETAILS*
┌────────────────────────────
│  Company : ${customer?.companyName || "Unknown"}
│  Color   : ${customer?.color || "-"}
│  Weight  : ${customer?.weight || "-"} KG
└────────────────────────────
  `;
  if (water.remarks) {
    message += `
📝 REMARKS : ${water.remarks}

    `;
  }
    message += `
⏳ *TOTAL RUNNING TIME*
  ━━━━━━━━━━━━━━━━━━━━━━
    *${water.runningTime ?? 0} minutes*
  ━━━━━━━━━━━━━━━━━━━━━━
    `;
  /* REMARKS */
  
  if (["Completed"].includes(action)) {
    message += `
💧 *WATER COST*
  ━━━━━━━━━━━━━━━━━━━━━━
   💰 *₹ ${water.totalWaterCost || 0}*
  ━━━━━━━━━━━━━━━━━━━━━━
    `;
  }

  owners.forEach(number => sendWhatsApp(number, message));
};

// Helper: Send Notification
export const startWaterProcess = async (req, res) => {
  try {
    const { receiverNo, openingReading } = req.body;
    const userName = req.user?.name || "System";

    if (!receiverNo) {
      return res.status(400).json({ message: "receiverNo is required" });
    }

    // Only start if fabric is in Pending state
    const fabric = await listProcess.findOne({
      receiverNo,
      status: { $in: ["Pending", "Reprocess"] }   // <-- Updated
    });

    if (!fabric) {
      return res.status(404).json({
        message: "No pending task found for this receiverNo"
      });
    }
    const now = new Date();
    // Create Water Process
    const water = await Water.create({
      receiverNo,
      openingReading,
      startTime: new Date(),
      startTimeFormatted: formatTime(toIST(now)),    
      status: "Running",
      runningTime: 0,
      startedBy: userName,
      operator: userName,
      machineNo:fabric.machineNo,
         // Store Operator Here

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
    const updatedFabric = await listProcess.findByIdAndUpdate(
      fabric._id,
      {
        status: "Running",
        operator: userName
      },
      { new: true }
    );
   
const customer = await CustomerDetails.findOne({ receiverNo: water.receiverNo });
    notifyOwners(water, customer, "Running");

  
    return res.status(201).json({
      message: "Water process started successfully",
      water,
      fabric: updatedFabric

    });

  } catch (error) {
    console.error("START ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* =====================================================
   PAUSE WATER PROCESS
===================================================== */
// export const pauseWaterProcess = async (req, res) => {
//   try {
//     const { id } = req.params; // <-- use ID from URL
//     const { remarks } = req.body;
//     const userName = req.user?.name || "System";

//     // Find water process by ID
//     const water = await Water.findById(id);
//     if (!water) return res.status(404).json({ message: "Water record not found" });

//     /* -----------------------------------------------------
//        CASE 1: PROCESS IS RUNNING → PAUSE IT
//     ----------------------------------------------------- */
//     if (water.status === "Running") {
//       const now = new Date();

//       // Add running time until now
//       if (water.startTime) {
//         water.runningTime += (now - new Date(water.startTime)) / 60000;
//         water.runningTime = Number(water.runningTime.toFixed(2));
//       }

//       // Update to Paused
//       water.status = "Paused";
//       water.startTime = null;
//       water.remarks = remarks;

//       addWaterHistory(
//         water,
//         "Paused",
//         { runningTime: water.runningTime, remarks },
//         userName
//       );

//       await water.save();

//       // Optionally, update related listProcess by receiverNo
//       if (water.receiverNo) {
//         await listProcess.updateOne({ receiverNo: water.receiverNo }, { status: "Paused" });
//       }

//       return res.status(200).json({
//         message: "Water process paused",
//         water
//       });
//     }

//     /* -----------------------------------------------------
//        CASE 2: PROCESS IS PAUSED → RESUME IT
//     ----------------------------------------------------- */
//     if (water.status === "Paused") {
//       water.startTime = new Date();
//       water.status = "Running";
//       water.remarks = remarks;

//       addWaterHistory(
//         water,
//         "Resumed",
//         { remarks },
//         userName
//       );

//       await water.save();

//       // Optionally, update related listProcess by receiverNo
//       if (water.receiverNo) {
//         await listProcess.updateOne({ receiverNo: water.receiverNo }, { status: "Running" , runningtime: water.runningTime });
//       }

//       return res.status(200).json({
//         message: "Water process resumed",
//         water
//       });
//     }

//     /* -----------------------------------------------------
//        IF OTHER STATUS
//     ----------------------------------------------------- */
//     return res.status(400).json({
//       message: `Cannot toggle when status is ${water.status}`
//     });

//   } catch (error) {
//     console.error("TOGGLE ERROR:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };
export const pauseWaterProcess = async (req, res) => {
  try {
    const { id } = req.params; 
    const { remarks } = req.body;
    const userName = req.user?.name || "System";

    let water = await Water.findById(id);
    if (!water)
      return res.status(404).json({ message: "Water record not found" });

    const now = new Date();

    /* -----------------------------------------------------
       CASE 1: RUNNING → PAUSE
    ----------------------------------------------------- */
    if (water.status === "Running") {

      // Calculate running time up to this pause moment
      if (water.startTime) {
        const minutes = (now - new Date(water.startTime)) / 60000;
        water.runningTime = Number((water.runningTime + minutes).toFixed(2));
      }

      // Pause the process
      water.status = "Paused";
      water.startTime = null;               // Freeze timer
      water.remarks = remarks;

      addWaterHistory(
        water,
        "Paused",
        { runningTime: water.runningTime, remarks },
        userName
      );

      await water.save();

      // Update related listProcess
      if (water.receiverNo) {
        await listProcess.updateOne(
          { receiverNo: water.receiverNo },
          { status: "Paused", runningTime: water.runningTime }
        );
      }
const customer = await CustomerDetails.findOne({ receiverNo: water.receiverNo });

       notifyOwners(water, customer, "Paused");
      return res.status(200).json({
        message: "Water process paused",
        runningTime: water.runningTime,   // <-- RETURNED ALWAYS
        water
      });
    }

    /* -----------------------------------------------------
       CASE 2: PAUSED → RESUME
    ----------------------------------------------------- */
    if (water.status === "Paused") {

      // Resume timer (do NOT reset runningTime)
      water.status = "Running";
      water.startTime = new Date();        // Start counting from now
      water.remarks = remarks;

      addWaterHistory(
        water,
        "Resumed",
        { remarks },
        userName
      );

      await water.save();

      // Update fabric process
      if (water.receiverNo) {
        await listProcess.updateOne(
          { receiverNo: water.receiverNo },
          { status: "Running", runningTime: water.runningTime }
        );
      }
      const customer = await CustomerDetails.findOne({ receiverNo: water.receiverNo });

  notifyOwners(water, customer, "Resumed");
      return res.status(200).json({
        message: "Water process resumed",
        runningTime: water.runningTime,    // <-- STILL RETURNED
        water
      });
    }
    
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
    // const { closingReading } = req.body;
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
    water.status = "Stopped"; // or "Completed" if you prefer
    water.endTime = now;
    water.endTimeFormatted = formatTime(toIST(now));
    // water.closingReading = closingReading;

    addWaterHistory(
      water,
      "Stopped",
      {  runningTime: water.runningTime },
      userName
    );

    await water.save();

    // Optionally, update related listProcess by receiverNo
    if (water.receiverNo) {
      await listProcess.updateOne(
        { receiverNo: water.receiverNo },
        { status: "Stopped",
          runningTime: water.runningTime 
         }
      );
    }const customer = await CustomerDetails.findOne({ receiverNo: water.receiverNo });

  notifyOwners(water, customer, "Stopped");
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
// export const calculateWaterCost = async (req, res) => {
//   try {
//     const { id } = req.body;
//     const userName = req.user?.name || "Unknown";

//     const water = await Water.findById(id);
//     if (!water)
//       return res.status(404).json({ message: "Water process not found" });

//     const customer = await CustomerDetails.findOne({
//       receiverNo: water.receiverNo
//     });

//     if (!customer)
//       return res.status(404).json({ message: "Customer details not found" });

//     const weight = customer.weight || 1;
//     const units =
//       (water.closingReading || 0) - (water.openingReading || 0);

//     let cost = Number(((units / weight) * 0.4).toFixed(2));
//     if (isNaN(cost) || cost < 0) cost = 0;

//     water.totalWaterCost = cost;

//     water.status = "Completed";

//     addWaterHistory(
//       water,
//       "Completed",
//       { totalWaterCost: water.totalWaterCost },
//       userName
//     );

//     await water.save();

//     return res.status(200).json({
//       message: "Water cost calculated & process marked as Completed",
//       water,
//       runningTime: water.runningTime.toFixed(2) + " minutes"
//     });

//   } catch (error) {
//     console.error("COST ERROR:", error);
//     return res.status(500).json({
//       message: "Server error",
//       error: error.message
//     });
//   }
// };
export const calculateWaterCost = async (req, res) => {
  try {
    const { id } = req.params;
    const { closingReading } = req.body;
    const userName = req.user?.name || "Unknown";

    const water = await Water.findById(id);
    if (!water) return res.status(404).json({ message: "Water process not found" });

    // Persist closingReading if provided
    if (closingReading !== undefined && closingReading !== null && closingReading !== "") {
      water.closingReading = Number(closingReading);
    }

    // Validate readings
    if (water.openingReading === undefined || water.openingReading === null || water.closingReading === undefined || water.closingReading === null) {
      return res.status(400).json({ message: "Opening and closing readings are required to calculate water cost" });
    }

    const receiverNo = String(water.receiverNo).trim();
    const customer = await CustomerDetails.findOne({ receiverNo });

    if (!customer) {
      return res.status(404).json({ message: `Customer details not found for receiverNo: ${receiverNo}` });
    }

    // Units and cost using selected formula
    const units = Number(water.closingReading) - Number(water.openingReading);

    const weight = Number(customer.weight || 1);
    let cost = Number(((units / (weight || 1)) * 0.4).toFixed(2));
    if (isNaN(cost) || cost < 0) cost = 0;

    water.totalWaterCost = cost;
    water.status = "Completed";

    addWaterHistory(water, "Water Process Completed", { closingReading: water.closingReading, unitsUsed: units, totalWaterCost: cost }, userName);
    await water.save();

    // Update fabric process
    const fabric = await listProcess.findOne({ receiverNo });
    if (fabric) {
      fabric.status = "Completed";
      fabric.operator = water.operator;
      fabric.waterCost = cost;
      fabric.runningTime = water.runningTime || 0;
      fabric.history = fabric.history || [];
      fabric.history.push({
        action: "Fabric Completed",
        changes: { waterCost: cost, runningTime: fabric.runningTime },
        user: userName,
        date: new Date()
      });
      await fabric.save();
    }

    notifyOwners(water, customer, "Completed");

    return res.status(200).json({
      message: "Water & Fabric marked as Completed",
      water,
      fabric,
      runningTime: (water.runningTime || 0).toFixed(2) + " minutes"
    });
  } catch (error) {
    console.error("COST ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
