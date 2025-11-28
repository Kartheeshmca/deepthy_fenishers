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
    const updatedFabric = await FabricProcess.findByIdAndUpdate(
      fabric._id,
      {
        status: "Running",
        operator: userName
      },
      { new: true }
    );

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

//       // Optionally, update related FabricProcess by receiverNo
//       if (water.receiverNo) {
//         await FabricProcess.updateOne({ receiverNo: water.receiverNo }, { status: "Paused" });
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

//       // Optionally, update related FabricProcess by receiverNo
//       if (water.receiverNo) {
//         await FabricProcess.updateOne({ receiverNo: water.receiverNo }, { status: "Running" , runningtime: water.runningTime });
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

      // Update related FabricProcess
      if (water.receiverNo) {
        await FabricProcess.updateOne(
          { receiverNo: water.receiverNo },
          { status: "Paused", runningTime: water.runningTime }
        );
      }

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
        await FabricProcess.updateOne(
          { receiverNo: water.receiverNo },
          { status: "Running", runningTime: water.runningTime }
        );
      }

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
        { status: "Freezed",
          runningTime: water.runningTime 
         }
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
    const userName = req.user?.name || "Unknown";

    // 1️⃣ Get Water Process
    const water = await Water.findById(id);
    if (!water)
      return res.status(404).json({ message: "Water process not found" });

    // 2️⃣ Get Customer Details to calculate water cost
    const customer = await CustomerDetails.findOne({
      receiverNo: water.receiverNo
    });

    if (!customer)
      return res
        .status(404)
        .json({ message: "Customer details not found" });

    const weight = customer.weight || 1;
    const units =
      (water.closingReading || 0) - (water.openingReading || 0);

    // 3️⃣ Calculate cost
    let cost = Number(((units / weight) * 0.4).toFixed(2));
    if (isNaN(cost) || cost < 0) cost = 0;

    water.totalWaterCost = cost;

    // 🔥 4️⃣ MARK WATER AS COMPLETED
    water.status = "Completed";

    // Save history for water
    addWaterHistory(
      water,
      "Water Process Completed",
      {
        closingReading: water.closingReading,
        unitsUsed: units,
        totalWaterCost: cost
      },
      userName
    );

    await water.save();

    // 5️⃣ FIND FABRIC PROCESS AND MARK COMPLETED
    const fabric = await FabricProcess.findOne({
      receiverNo: water.receiverNo
    });

   if (fabric) {
  fabric.status = "Completed";
  fabric.operator = water.operator;

  fabric.waterCost = cost; // ⭐ store for getAllFabricProcesses()
  fabric.runningTime= water.runningTime
  fabric.history.push({
    action: "Fabric Completed",
    changes: { waterCost: cost , runningTime: water.runningTime},
    user: userName,
    date: new Date()
  });

  await fabric.save();
}


    return res.status(200).json({
      message: "Water & Fabric marked as Completed",
      water,
      fabric,
      runningTime: (water.runningTime || 0).toFixed(2) + " minutes"
    });

  } catch (error) {
    console.error("COST ERROR:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};
