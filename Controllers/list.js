import listProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";
import User from "../Models/User.js";
import Water from "../Models/Water.js";

/* ============================================================================
// CREATE FABRIC PROCESS (ASSIGN WORK)
============================================================================ */
export const createFabricProcess = async (req, res) => {
  try {
    let {
      receiverNo,
      qty,
      machineNo,
      rate,
      shiftIncharge,
      operator,
      date,
      order,
      companyName,
      partyDcNo
    } = req.body;

    // -----------------------------
    // 1. Handle Customer
    // -----------------------------
    let customer;

    if (!receiverNo) {
      // Auto-generate receiverNo
      const lastCustomer = await CustomerDetails.findOne({}).sort({ receiverNo: -1 });
      const nextNumber = lastCustomer?.receiverNo
        ? parseInt(lastCustomer.receiverNo.split("-")[1]) + 1
        : 1000;

      receiverNo = `R-${nextNumber}`;

      customer = await CustomerDetails.create({
        receiverNo,
        companyName,
        partyDcNo,
        createdBy: req.user?.id,
        date: date || new Date(),
      });
    } else {
      customer = await CustomerDetails.findOne({ receiverNo });
      if (!customer)
        return res.status(404).json({ success: false, message: "Receiver No not found" });
    }

    // -----------------------------
    // 2. Validate Operator
    // -----------------------------
    const operatorUser = await User.findOne({ name: new RegExp(`^${operator}$`, "i") });
    if (!operatorUser)
      return res.status(404).json({ success: false, message: "Operator not found" });

    // -----------------------------
    // 3. Prevent Duplicate Pending / Running
    // -----------------------------
    const existingProcess = await listProcess.findOne({
      receiverNo,
      status: { $in: ["Pending", "Running"] }
    });

    if (existingProcess)
      return res.status(400).json({
        success: false,
        message: "Task already exists for this receiver"
      });

    // -----------------------------
    // 4. Determine Order
    // -----------------------------
    let taskOrder = order;

    if (!taskOrder) {
      const lastTask = await listProcess.findOne({ operator }).sort({ order: -1 });
      taskOrder = lastTask ? lastTask.order + 1 : 1;
    } else {
      await listProcess.updateMany(
        { operator, order: { $gte: taskOrder } },
        { $inc: { order: 1 } }
      );
    }

    // -----------------------------
    // 5. Create Fabric Process
    // -----------------------------
    const processEntry = await listProcess.create({
      receiverNo,
      customer: customer._id,
      date: date || new Date(),
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

    // -----------------------------
    // 6. Assign Operator Task
    // -----------------------------
    await User.findByIdAndUpdate(operatorUser._id, {
      $push: {
        assignedFabrics: {
          fabricProcess: processEntry._id,
          receiverNo,
          status: "Pending",
          assignedDate: date || new Date(),
          startTime: null,
          endTime: null
        }
      }
    });

    const result = await listProcess.findById(processEntry._id).populate("customer");

    return res.status(201).json({
      success: true,
      message: "Fabric process created successfully",
      data: result
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
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
      shiftIncharge: previous.shiftIncharge,
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
    const operatorName = req.user?.name;
    if (!operatorName)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const operator = await User.findOne({ name: operatorName }).lean();
    if (!operator)
      return res.status(404).json({ success: false, message: "Operator not found" });

    const selectedDate = req.query.date ? new Date(req.query.date) : new Date();
    selectedDate.setHours(0, 0, 0, 0);

    const assignedToday = operator.assignedFabrics.filter(a => {
      const d = new Date(a.assignedDate);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === selectedDate.getTime() && a.status === "Pending";
    });

    if (!assignedToday.length)
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: "No pending tasks for selected date"
      });

    const ids = assignedToday.map(a => a.fabricProcess);

    let fabrics = await listProcess.find({
      _id: { $in: ids },
      status: "Pending"
    })
      .populate("customer")
      .lean();

    fabrics = fabrics.sort((a, b) => a.order - b.order);

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

    return res.status(200).json({
      success: true,
      count: fabrics.length,
      data: fabrics
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
// UPDATE FABRIC PROCESS
============================================================================ */
export const updateFabricProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fabric = await listProcess.findById(id);
    if (!fabric)
      return res.status(404).json({ success: false, message: "Not found" });

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

/* ============================================================================
// DELETE PROCESS
============================================================================ */
export const deleteFabricProcess = async (req, res) => {
  try {
    const { id } = req.params;

    const fabric = await listProcess.findById(id);
    if (!fabric)
      return res.status(404).json({ success: false, message: "Not found" });

    const operator = fabric.operator;
    const order = fabric.order;

    await User.updateOne(
      { name: operator },
      { $pull: { assignedFabrics: { fabricProcess: id } } }
    );

    await listProcess.findByIdAndDelete(id);

    await listProcess.updateMany(
      { operator, order: { $gt: order } },
      { $inc: { order: -1 } }
    );

    return res.status(200).json({
      success: true,
      message: "Deleted successfully"
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
export const addDyesAndChemicalsByReceiver = async (req, res) => {
  try {
    const { receiverNo } = req.params;
    const { dyes = [], chemicals = [] } = req.body;

    const userName = req.user?.name || "System";

    const fabric = await listProcess
      .findOne({ receiverNo })
      .sort({ createdAt: -1 });

    if (!fabric)
      return res.status(404).json({ success: false, message: "Fabric not found" });

    if (fabric.status !== "Completed")
      return res.status(400).json({
        success: false,
        message: "Can add dyes/chemicals only to Completed fabrics"
      });

    if (dyes.length > 0) fabric.dyes.push(...dyes);
    if (chemicals.length > 0) fabric.chemicals.push(...chemicals);

    const dyesCost = fabric.dyes.reduce((sum, d) => sum + d.qty * d.cost, 0);
    const chemicalsCost = fabric.chemicals.reduce((sum, c) => sum + c.qty * c.cost, 0);

    fabric.totalCost = fabric.rate * fabric.qty + dyesCost + chemicalsCost;

    fabric.history.push({
      action: "Dyes & Chemicals Added",
      changes: { dyes, chemicals, totalCost: fabric.totalCost },
      user: userName,
      date: new Date()
    });

    await fabric.save();

    const updated = await listProcess
      .findOne({ receiverNo })
      .populate("customer");

    return res.status(200).json({
      success: true,
      message: "Dyes & chemicals added",
      data: updated
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
