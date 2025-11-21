import listProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";
import User from "../Models/User.js";
import Water from "../Models/Water.js";
/* ============================================================================
// CREATE FABRIC PROCESS (ASSIGN WORK)
============================================================================ */
export const createFabricProcess = async (req, res) => {
  try {
    const { receiverNo, qty, machineNo, rate, shiftIncharge, operator, date, order } = req.body;

    // Validate customer
    const customer = await CustomerDetails.findOne({ receiverNo });
    if (!customer) return res.status(404).json({ success: false, message: "Receiver No not found" });

    // Validate operator
    const operatorUser = await User.findOne({ name: new RegExp(`^${operator}$`, "i") });
    if (!operatorUser) return res.status(404).json({ success: false, message: "Operator not found" });

    // Prevent duplicate pending/running
    const existingProcess = await listProcess.findOne({ receiverNo, status: { $in: ["Pending","Running"] } });
    if (existingProcess) return res.status(400).json({ success: false, message: "Task already exists for this receiver" });

    // Determine order
    let taskOrder = order;
    if (!taskOrder) {
      const lastTask = await listProcess.findOne({ operator }).sort({ order: -1 });
      taskOrder = lastTask ? lastTask.order + 1 : 1;
    } else {
      // Shift existing orders if conflict
      await listProcess.updateMany(
        { operator, order: { $gte: taskOrder } },
        { $inc: { order: 1 } }
      );
    }

    // Create fabric process
    const processEntry = await listProcess.create({
      receiverNo,
      customer: customer._id,
      date,
      qty,
      machineNo,
      rate,
      totalCost: qty * rate,
      shiftIncharge,
      operator,
      order: taskOrder,
      status: "Pending",
      history: [{
        action: "Process Created",
        changes: { status: "Pending", receiverNo, operator, order: taskOrder },
        user: req.user?.name || "System",
        date: new Date()
      }]
    });

    // Assign to operator
    await User.findByIdAndUpdate(operatorUser._id, {
      $push: {
        assignedFabrics: {
          fabricProcess: processEntry._id,
          receiverNo,
          status: "Pending",
          assignedDate: date,
          startTime: null,
          endTime: null
        }
      }
    });

    const result = await listProcess.findById(processEntry._id).populate("customer");
    return res.status(201).json({ success: true, message: "Fabric process created successfully", data: result });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/* ============================================================================
   RE-PROCESS FABRIC (CREATE NEW ENTRY WITH UPDATED RECEIVER NO)
============================================================================ */
export const getCompletedFabricProcesses = async (req, res) => {
  try {
    // Fetch all completed fabrics
    const fabrics = await listProcess
      .find({ status: "Completed" })
      .populate("customer")
      .sort({ createdAt: -1 })
      .lean();

    const result = [];

    for (const fabric of fabrics) {
      // Initialize values
      let waterCost = 0;
      let previousWaterCost = 0;
      let totalCostWithWater = fabric.totalCost || 0;
      let waterProcess = null;

      // Try fetching water process if exists
      const waterEntry = await Water.findOne({ receiverNo: fabric.receiverNo }).lean();
      if (waterEntry) {
        waterCost = waterEntry.totalWaterCost || 0;
        waterProcess = waterEntry;
        totalCostWithWater += waterCost;
      }

      // Check for previous reprocessed entries
      const previousProcesses = await listProcess.find({
        receiverNo: { $regex: `^RE-${fabric.receiverNo}` },
        _id: { $ne: fabric._id }
      }).lean();

      if (previousProcesses.length) {
        for (const prev of previousProcesses) {
          const prevWater = await Water.findOne({ receiverNo: prev.receiverNo }).lean();
          previousWaterCost += prevWater?.totalWaterCost || 0;
        }
      }

      result.push({
        ...fabric,
        waterCost,
        previousWaterCost,
        totalCostWithWater,
        waterProcess
      });
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error("Error fetching completed fabrics:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/* ============================================================================
// REPROCESS FABRIC: Add water cost to totalCost
============================================================================ */
export const reProcessFabricWithWaterCost = async (req, res) => {
  try {
    const { receiverNo } = req.params;
    const userName = req.user?.name || "System";

    // 1️⃣ Find latest process
    const previous = await listProcess.findOne({ receiverNo }).sort({ createdAt: -1 });
    if (!previous) return res.status(404).json({ success: false, message: "Receiver No not found" });

    if (previous.status === "Pending") {
      return res.status(400).json({ success: false, message: "Cannot Re-Process. Process is still Pending." });
    }

    // 2️⃣ Get water cost from previous process
    const prevWater = await Water.findOne({ receiverNo: previous.receiverNo });
    const prevWaterCost = prevWater?.totalWaterCost || 0;

    // 3️⃣ Calculate new cycle & receiverNo
    const newCycle = (previous.cycle || 0) + 1;
    const newReceiverNo = `RE-${receiverNo}-${newCycle}`;

    // 4️⃣ Mark previous as Pending & add history
    await listProcess.findByIdAndUpdate(previous._id, {
      status: "Pending",
      $push: {
        history: {
          action: "Re-Processed (Old entry marked Pending)",
          changes: { oldReceiver: receiverNo, oldStatus: previous.status, newStatus: "Pending", cycle: previous.cycle },
          user: userName
        }
      }
    });

    // 5️⃣ Remove old assignment from operator
    await User.updateOne(
      { name: previous.operator },
      { $pull: { assignedFabrics: { fabricProcess: previous._id } } }
    );

    // 6️⃣ Determine new order
    const lastTask = await listProcess.findOne({ operator: previous.operator, date: previous.date }).sort({ order: -1 });
    const newOrder = lastTask ? lastTask.order + 1 : 1;

    // 7️⃣ Create new process
    const newProcess = await listProcess.create({
      receiverNo: newReceiverNo,
      customer: previous.customer,
      date: previous.date,
      qty: previous.qty,
      machineNo: previous.machineNo,
      rate: previous.rate,
      totalCost: previous.totalCost + prevWaterCost, // add previous water cost
      shiftIncharge: previous.shiftIncharge,
      operator: previous.operator,
      cycle: newCycle,
      status: "Pending",
      order: newOrder,
      history: [
        {
          action: "Re-Processed (New Cycle Started)",
          changes: { from: receiverNo, to: newReceiverNo, cycle: newCycle, order: newOrder, prevWaterCost },
          user: userName
        }
      ]
    });

    // 8️⃣ Assign new process to operator
    await User.updateOne(
      { name: previous.operator },
      {
        $push: {
          assignedFabrics: {
            fabricProcess: newProcess._id,
            receiverNo: newReceiverNo,
            status: "Pending",
            assignedDate: previous.date,
            startTime: null,
            endTime: null
          }
        }
      }
    );

    const result = await listProcess.findById(newProcess._id).populate("customer").lean();
    return res.status(201).json({
      success: true,
      message: "Fabric Re-Processed with water cost added to totalCost",
      data: result
    });

  } catch (error) {
    console.error("Error re-processing fabric with water cost:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
/* ============================================================================
   GET ONLY PENDING FABRIC PROCESS LIST (FOR TABLE)
============================================================================ */
/* ============================================================================
   GET ONLY LATEST PENDING FABRIC PROCESS (PER RECEIVER NO)
============================================================================ */
export const getPendingFabricProcesses = async (req, res) => {
  try {
    const { machineNo, receiverNo } = req.query;

    // Build dynamic filter
    let matchFilter = { status: "Pending" };
    if (machineNo) matchFilter.machineNo = { $regex: new RegExp(machineNo, "i") };
    if (receiverNo) matchFilter.receiverNo = { $regex: new RegExp(receiverNo, "i") };

    const list = await listProcess.aggregate([
      // 1) Apply dynamic filters
      { $match: matchFilter },

      // 2) Sort by createdAt descending to pick latest per receiver
      { $sort: { createdAt: -1 } },

      // 3) Group by receiverNo → keep latest record only
      {
        $group: {
          _id: "$receiverNo",
          latestEntry: { $first: "$$ROOT" }
        }
      },

      // 4) Replace root with actual document
      { $replaceRoot: { newRoot: "$latestEntry" } },

      // 5) Lookup customer info
      {
        $lookup: {
          from: "customerdetails",
          localField: "customer",
          foreignField: "_id",
          as: "customer"
        }
      },
      { $unwind: "$customer" },

      // 6) Final sort: latest machine first, latest receiver first
      { $sort: { machineNo: -1, receiverNo: -1 } }
    ]);

    return res.status(200).json({
      success: true,
      count: list.length,
      data: list
    });

  } catch (error) {
    console.log("Error fetching pending fabric list:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};
export const getOperatorAssignedFabrics = async (req, res) => {
  try {
    const operatorName = req.user?.name;
    if (!operatorName) 
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const operator = await User.findOne({ name: operatorName }).lean();
    if (!operator) 
      return res.status(404).json({ success: false, message: "Operator not found" });

    // Selected date (today by default)
    const selectedDate = req.query.date ? new Date(req.query.date) : new Date();
    selectedDate.setHours(0,0,0,0);

    // Filter assignedFabrics: only for selected date AND Pending status
    let assignedForDate = operator.assignedFabrics.filter(a => {
      const d = new Date(a.assignedDate);
      d.setHours(0,0,0,0);
      return d.getTime() === selectedDate.getTime() && a.status === "Pending";
    });

    if (!assignedForDate.length) 
      return res.status(200).json({ success: true, count: 0, data: [], message: "No pending tasks for selected date" });

    // Fetch fabricProcess documents for these assignments (Pending only)
    const ids = assignedForDate.map(a => a.fabricProcess);
    let fabrics = await listProcess.find({ _id: { $in: ids }, status: "Pending" })
      .populate("customer")
      .lean();

    // Sort by 'order' assigned by admin
    fabrics = fabrics.sort((a, b) => a.order - b.order);

    // Enable Start button only for first pending task
    let firstPendingFound = false;
    fabrics = fabrics.map(f => {
      if (!firstPendingFound && f.status === "Pending") {
        firstPendingFound = true;
        f.canStart = true;
      } else {
        f.canStart = false;
      }
      return f;
    });

    return res.status(200).json({ success: true, count: fabrics.length, data: fabrics });

  } catch (error) {
    console.error("Error fetching operator tasks:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


export const updateFabricProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fabric = await listProcess.findById(id);
    if (!fabric)
      return res.status(404).json({ success: false, message: "Not found" });

    // If order changed → reorder
    if (updates.order && updates.order !== fabric.order) {
      await listProcess.updateMany(
        {
          operator: fabric.operator,
          order: { $gte: updates.order }
        },
        { $inc: { order: 1 } }
      );
    }

    Object.assign(fabric, updates);
    fabric.history.push({
      action: "Updated",
      changes: updates,
      user: req.user?.name || "System"
    });

    await fabric.save();

    return res.status(200).json({ success: true, data: fabric });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
export const deleteFabricProcess = async (req, res) => {
  try {
    const { id } = req.params;

    const fabric = await listProcess.findById(id);
    if (!fabric)
      return res.status(404).json({ success: false, message: "Not found" });

    const operator = fabric.operator;
    const order = fabric.order;

    // Remove from operator
    await User.updateOne(
      { name: operator },
      { $pull: { assignedFabrics: { fabricProcess: id } } }
    );

    // Delete
    await listProcess.findByIdAndDelete(id);

    // Re-order remaining tasks
    await listProcess.updateMany(
      { operator, order: { $gt: order } },
      { $inc: { order: -1 } }
    );

    return res.status(200).json({ success: true, message: "Deleted successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
export const getAllFabricProcesses = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.operator) filter.operator = req.query.operator;

    const list = await listProcess
      .find(filter)
      .sort({ order: 1 })
      .populate("customer");

    return res.status(200).json({ success: true, count: list.length, data: list });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};export const getFabricProcessById = async (req, res) => {
  try {
    const fabric = await listProcess.findById(req.params.id).populate("customer");

    if (!fabric)
      return res.status(404).json({ success: false, message: "Not found" });

    return res.status(200).json({ success: true, data: fabric });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

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
      const totalCostWithWater = fabric.totalCost + waterCost;

      result.push({
        ...fabric,
        ...(waterEntry ? { waterCost, totalCostWithWater, waterProcess: waterEntry } : {})
      });
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error("Error fetching machine-wise report:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
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
      const totalCostWithWater = fabric.totalCost + waterCost;

      result.push({
        ...fabric,
        ...(waterEntry ? { waterCost, totalCostWithWater, waterProcess: waterEntry } : {})
      });
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error("Error fetching receiver-wise report:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};