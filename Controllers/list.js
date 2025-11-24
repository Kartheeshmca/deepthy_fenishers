import listProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";
import User from "../Models/User.js";
import Water from "../Models/Water.js";
const getISTMidnight = (inputDate = new Date()) => {
  const date = new Date(inputDate);

  // Convert to IST by adding 5 hours 30 minutes
  date.setHours(date.getHours() + 5, date.getMinutes() + 30, 0, 0);

  // Set IST Midnight
  date.setHours(0, 0, 0, 0);

  return date;
};

export const createFabricProcess = async (req, res) => {
  try {
    const allowedRoles = ["owner", "admin", "shiftincharge"];

    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: "Only Owner/Admin/ShiftIncharge can create process"
      });
    }

    const { receiverNo, qty, machineNo, rate, shiftincharge, orderNo, date } = req.body;

    const customer = await CustomerDetails.findOne({ receiverNo });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Receiver number not found"
      });
    }

    if (!machineNo) {
      return res.status(400).json({ message: "Machine number is required" });
    }

    // 🔥 Prevent duplicate order numbers for same machine
    const existingOrder = await listProcess.findOne({ machineNo, orderNo });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: `Order number ${orderNo} already exists for Machine ${machineNo}`
      });
    }

    const totalCost = qty * rate;

    const processData = {
      receiverNo,
      customer: customer._id,
      qty,
      rate,
      totalCost,
      machineNo,
      shiftincharge,
      orderNo,
      createdBy: req.user._id,
      date: getISTMidnight(date),
    };

    const processEntry = await listProcess.create(processData);

    return res.status(201).json({
      success: true,
      message: "Fabric process created successfully",
      data: processEntry
    });

  } catch (error) {
    console.error("Error creating fabric process:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};


/* ============================================================================
// GET COMPLETED FABRIC PROCESSES WITH WATER COST
============================================================================ */
export const getCompletedFabricProcesses = async (req, res) => {
  try {
    const fabrics = await listProcess
      .find({ status: "Completed" })
      .populate("customer")
      .sort({ createdAt: -1 })
      .lean();

    const result = [];

    for (const fabric of fabrics) {
      const waterEntry = await Water.findOne({ receiverNo: fabric.receiverNo }).lean();
      const waterCost = waterEntry?.totalWaterCost || 0;

      result.push({
        ...fabric,
        waterCost,
        totalCostWithWater: fabric.totalCost + waterCost,
        waterProcess: waterEntry || null
      });
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error("Error fetching completed fabrics:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// RE-PROCESS FABRIC WITH WATER COST
============================================================================ */
export const reProcessFabricWithWaterCost = async (req, res) => {
  try {
    const { receiverNo } = req.params;
    const userName = req.user?.name || "System";

    const previous = await listProcess.findOne({ receiverNo }).sort({ createdAt: -1 });
    if (!previous)
      return res.status(404).json({ success: false, message: "Receiver No not found" });

    if (previous.status === "Pending")
      return res.status(400).json({
        success: false,
        message: "Cannot re-process. Process is still Pending."
      });

    const prevWater = await Water.findOne({ receiverNo }).lean();
    const prevWaterCost = prevWater?.totalWaterCost || 0;

    const newCycle = (previous.cycle || 0) + 1;
    const newReceiverNo = `RE-${receiverNo}-${newCycle}`;

    // Mark previous as Pending
    await listProcess.findByIdAndUpdate(previous._id, {
      status: "Pending",
      $push: {
        history: {
          action: "Re-Process Started",
          changes: { from: receiverNo, cycle: newCycle },
          user: userName
        }
      }
    });

    // Remove from operator task list
    await User.updateOne(
      { name: previous.operator },
      { $pull: { assignedFabrics: { fabricProcess: previous._id } } }
    );

    // Get order
    const lastTask = await listProcess
      .findOne({ operator: previous.operator, date: previous.date })
      .sort({ order: -1 });

    const newOrder = lastTask ? lastTask.order + 1 : 1;

    // Create new process
    const newProcess = await listProcess.create({
      receiverNo: newReceiverNo,
      customer: previous.customer,
      date: previous.date,
      qty: previous.qty,
      machineNo: previous.machineNo,
      rate: previous.rate,
      totalCost: previous.totalCost + prevWaterCost,
      shiftincharge: previous.shiftIncharge,
      operator: previous.operator,
      cycle: newCycle,
      status: "Pending",
      order: newOrder,
      history: [{
        action: "New Cycle Created",
        changes: { newReceiverNo, prevWaterCost },
        user: userName
      }]
    });

    // Assign to operator
    await User.updateOne(
      { name: previous.operator },
      {
        $push: {
          assignedFabrics: {
            fabricProcess: newProcess._id,
            receiverNo: newReceiverNo,
            status: "Pending",
            assignedDate: previous.date
          }
        }
      }
    );

    const result = await listProcess.findById(newProcess._id).populate("customer");

    return res.status(201).json({
      success: true,
      message: "Re-processed successfully",
      data: result
    });

  } catch (error) {
    console.error("Error re-processing:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// PENDING FABRICS (LATEST PER RECEIVER)
============================================================================ */
export const getPendingFabricProcesses = async (req, res) => {
  try {
    const { machineNo, receiverNo } = req.query;

    let matchFilter = { status: "Pending" };

    if (machineNo) matchFilter.machineNo = new RegExp(machineNo, "i");
    if (receiverNo) matchFilter.receiverNo = new RegExp(receiverNo, "i");

    const list = await listProcess.aggregate([
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$receiverNo",
          latestEntry: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latestEntry" } },
      {
        $lookup: {
          from: "customerdetails",
          localField: "customer",
          foreignField: "_id",
          as: "customer"
        }
      },
      { $unwind: "$customer" },
      { $sort: { machineNo: -1, receiverNo: -1 } }
    ]);

    return res.status(200).json({
      success: true,
      count: list.length,
      data: list
    });

  } catch (error) {
    console.error("Error fetching pending list:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// OPERATOR ASSIGNED FABRICS (TODAY)
============================================================================ */
export const getOperatorAssignedFabrics = async (req, res) => {
  try {
    // 1️⃣ Get operator name (from query or logged-in user)
    let operatorName = req.query.operator || req.user?.name || null;

    // 2️⃣ Normalize selected date
    const selectedDate = req.query.date ? new Date(req.query.date) : new Date();
    selectedDate.setHours(0, 0, 0, 0);

    let assignedData = [];

    // -----------------------------
    // CASE 1: Specific operator
    // -----------------------------
    if (operatorName && operatorName.trim() !== "") {
      const operator = await User.findOne({
        name: new RegExp(`^${operatorName}$`, "i")
      }).lean();

      if (!operator)
        return res.status(404).json({ success: false, message: "Operator not found" });

      assignedData = operator.assignedFabrics.filter(a => {
        const assigned = new Date(a.assignedDate);
        assigned.setHours(0, 0, 0, 0);
        return a.status === "Pending" && assigned.getTime() === selectedDate.getTime();
      });
    } else {
      // -----------------------------
      // CASE 2: All operators
      // -----------------------------
      const allOperators = await User.find({ role: "operator" }).lean();

      for (const op of allOperators) {
        const pendingForDate = op.assignedFabrics.filter(a => {
          const assigned = new Date(a.assignedDate);
          assigned.setHours(0, 0, 0, 0);
          return a.status === "Pending" && assigned.getTime() === selectedDate.getTime();
        });

        assignedData.push(...pendingForDate);
      }
    }

    if (!assignedData.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: "No pending tasks for selected date"
      });
    }

    // 3️⃣ Get all fabric process IDs
    const ids = assignedData.map(a => a.fabricProcess);

    // 4️⃣ Fetch fabric processes with customer details
    let fabrics = await listProcess
      .find({ _id: { $in: ids }, status: "Pending" })
      .populate("customer")
      .lean();

    // 5️⃣ Sort by machine order
    fabrics.sort((a, b) => a.order - b.order);

    // 6️⃣ Mark first pending fabric as canStart
    let first = false;
    fabrics = fabrics.map(f => {
      if (!first && f.status === "Pending") {
        first = true;
        f.canStart = true;
      } else {
        f.canStart = false;
      }
      return f;
    });

    // 7️⃣ Return response
    return res.status(200).json({
      success: true,
      count: fabrics.length,
      data: fabrics
    });

  } catch (error) {
    console.error("Error fetching operator fabrics:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// UPDATE FABRIC PROCESS
============================================================================ */
export const updateFabricProcess = async (req, res) => {
  try {
    const { receiverNo } = req.params;   // 🔥 Use receiverNo instead of id
    const updates = req.body;

    const fabric = await listProcess.findOne({ receiverNo });
    if (!fabric) {
      return res.status(404).json({ success: false, message: "Process not found for this Receiver No" });
    }

    // ------------------------------
    // 🔥 ORDER UPDATE HANDLING
    // ------------------------------
    if (updates.order && updates.order !== fabric.order) {
      await listProcess.updateMany(
        {
          operator: fabric.operator,
          order: { $gte: updates.order }
        },
        { $inc: { order: 1 } }
      );
    }

    // ------------------------------
    // 🔥 IF RECEIVER NO UPDATED
    // ------------------------------
    if (updates.receiverNo && updates.receiverNo !== fabric.receiverNo) {
      await User.updateMany(
        { "assignedFabrics.receiverNo": receiverNo },
        { $set: { "assignedFabrics.$.receiverNo": updates.receiverNo } }
      );
    }

    Object.assign(fabric, updates);

    fabric.history.push({
      action: "Updated",
      changes: updates,
      user: req.user?.name || "System"
    });

    await fabric.save();

    return res.status(200).json({
      success: true,
      message: "Fabric process updated successfully",
      data: fabric
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
export const deleteFabricProcess = async (req, res) => {
  try {
    const { receiverNo } = req.params;   // 🔥 Use receiverNo instead of id

    const fabric = await listProcess.findOne({ receiverNo });
    if (!fabric) {
      return res.status(404).json({
        success: false,
        message: "Process not found for this Receiver No"
      });
    }

    const operator = fabric.operator;
    const order = fabric.order;

    // ------------------------------------
    // 🔥 REMOVE ASSIGNMENTS FROM ALL OPERATORS
    // ------------------------------------
    await User.updateMany(
      {},
      { $pull: { assignedFabrics: { receiverNo } } }
    );

    // ------------------------------------
    // 🔥 DELETE THE FABRIC PROCESS
    // ------------------------------------
    await listProcess.deleteOne({ receiverNo });

    // ------------------------------------
    // 🔥 FIX ORDER FOR REMAINING PROCESSES
    // ------------------------------------
    await listProcess.updateMany(
      { operator, order: { $gt: order } },
      { $inc: { order: -1 } }
    );

    return res.status(200).json({
      success: true,
      message: "Fabric process deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// ALL FABRIC PROCESSES
============================================================================ */
export const getAllFabricProcesses = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.operator) filter.operator = req.query.operator;

    const list = await listProcess
      .find(filter)
      .sort({ order: 1 })
      .populate("customer");

    return res.status(200).json({
      success: true,
      count: list.length,
      data: list
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// GET FABRIC BY ID
============================================================================ */
export const getFabricProcessById = async (req, res) => {
  try {
    const fabric = await listProcess
      .findById(req.params.id)
      .populate("customer");

    if (!fabric)
      return res.status(404).json({ success: false, message: "Not found" });

    return res.status(200).json({ success: true, data: fabric });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// MACHINE-WISE REPORT
============================================================================ */
export const getFabricReportByMachine = async (req, res) => {
  try {
    const { machineNo } = req.params;

    if (!machineNo)
      return res.status(400).json({ success: false, message: "machineNo is required" });

    const fabrics = await listProcess
      .find({ machineNo: new RegExp(`^${machineNo}$`, "i") })
      .populate("customer")
      .sort({ createdAt: -1 })
      .lean();

    const result = [];

    for (const fabric of fabrics) {
      const waterEntry = await Water.findOne({ receiverNo: fabric.receiverNo }).lean();
      const waterCost = waterEntry?.totalWaterCost || 0;

      result.push({
        ...fabric,
        waterCost,
        totalCostWithWater: fabric.totalCost + waterCost,
        waterProcess: waterEntry || null
      });
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// RECEIVER-WISE REPORT
============================================================================ */
export const getFabricReportByReceiver = async (req, res) => {
  try {
    const { receiverNo } = req.params;

    if (!receiverNo)
      return res.status(400).json({ success: false, message: "receiverNo is required" });

    const fabrics = await listProcess
      .find({ receiverNo: new RegExp(receiverNo, "i") })
      .populate("customer")
      .sort({ createdAt: -1 })
      .lean();

    const result = [];

    for (const fabric of fabrics) {
      const waterEntry = await Water.findOne({ receiverNo: fabric.receiverNo }).lean();
      const waterCost = waterEntry?.totalWaterCost || 0;

      result.push({
        ...fabric,
        waterCost,
        totalCostWithWater: fabric.totalCost + waterCost,
        waterProcess: waterEntry || null
      });
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// ADD DYES AND CHEMICALS
============================================================================ */
/* ============================================================================
   ADD DYES AND CHEMICALS (Status must be Completed)
   Automatically updates total cost
============================================================================ */
export const addDyesAndChemicalsByReceiver = async (req, res) => {
  try {
    const { receiverNo } = req.params;
    const { dyes = [], chemicals = [] } = req.body;

    const userName = req.user?.name || "System";

    // Find latest entry by receiver number
    const fabric = await listProcess
      .findOne({ receiverNo })
      .sort({ createdAt: -1 });

    if (!fabric)
      return res.status(404).json({ success: false, message: "Fabric not found" });

    // Ensure process is completed
    if (fabric.status !== "Completed") {
      return res.status(400).json({
        success: false,
        message: "Dyes/Chemicals can be added only to Completed fabrics"
      });
    }

    // Push dyes & chemicals
    if (Array.isArray(dyes) && dyes.length > 0) {
      fabric.dyes.push(...dyes);
    }

    if (Array.isArray(chemicals) && chemicals.length > 0) {
      fabric.chemicals.push(...chemicals);
    }

    // =======================
    // COST CALCULATIONS
    // =======================

    // Dye total
    const dyesCost = fabric.dyes.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      const cost = Number(item.cost) || 0;
      return sum + qty * cost;
    }, 0);

    // Chemical total
    const chemicalsCost = fabric.chemicals.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      const cost = Number(item.cost) || 0;
      return sum + qty * cost;
    }, 0);

    // Base process cost (rate * qty)
    const baseCost = (Number(fabric.rate) || 0) * (Number(fabric.qty) || 0);

    // Auto update total cost
    fabric.totalCost = baseCost + dyesCost + chemicalsCost;

    // Save history
    fabric.history.push({
      action: "Added dyes/chemicals",
      changes: { dyes, chemicals },
      user: userName,
      date: new Date()
    });

    await fabric.save();

    return res.status(200).json({
      success: true,
      message: "Dyes and chemicals added successfully",
      totalCost: fabric.totalCost,
      costBreakup: {
        baseCost,
        dyesCost,
        chemicalsCost
      },
      data: fabric
    });

  } catch (error) {
    console.error("Error adding dyes/chemicals:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getMachineQueue = async (req, res) => {
  try {
    const { machineNo } = req.query;

    if (!machineNo) {
      return res.status(400).json({ message: "Machine number required" });
    }

    const queue = await listProcess
      .find({ machineNo })
      .sort({ order: 1 }) // ALWAYS sorted by order
      .lean();

    return res.status(200).json({ success: true, queue });

  } catch (error) {
    return res.status(500).json({ message: "Server Error" });
  }
};
export const getPendingForAllOperators = async (req, res) => {
  try {
    const pending = await listProcess
      .find({
        $or: [
          { operator: { $exists: false } },
          { operator: null },
          { operator: "" }
        ]
      })
      .sort({ machineNo: 1, order: 1 }) // machine-wise + order-wise sorting
      .lean();

    return res.status(200).json({
      success: true,
      count: pending.length,
      pending
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error" });
  }
};
export const getFabricsByMachine = async (req, res) => {
  try {
    const { machineNo } = req.query;

    if (!machineNo) {
      return res.status(400).json({
        success: false,
        message: "Machine number is required",
      });
    }

    let filter = { machineNo };
    const userRole = req.user?.role;

    // Operator sees only today's IST date
    if (userRole === "operator") {
      const todayIST = getISTMidnight();
      filter.date = todayIST;
    }

    const fabricList = await listProcess
      .find(filter)
      .sort({ orderNo: 1 })    // 🔥 FIXED: Sort by orderNo
      .lean();

    if (!fabricList.length) {
      return res.status(404).json({
        success: false,
        message: "No fabrics assigned for you today",
      });
    }

    return res.status(200).json({
      success: true,
      machineNo,
      count: fabricList.length,
      data: fabricList,
    });

  } catch (error) {
    console.error("Error fetching fabrics by machine:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};
