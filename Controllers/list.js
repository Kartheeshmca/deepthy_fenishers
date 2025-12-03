import listProcess from "../Models/list.js";
import CustomerDetails from "../Models/Customer.js";
import User from "../Models/User.js";
import Water from "../Models/Water.js";
import MachineStatus from "../Models/Machinestatus.js";


import { sendWhatsApp } from "../Utils/twilio.js";
import { owners } from "../Config/owners.js";




const getLocalMidnight = (inputDate) => {
  const date = new Date(inputDate);
  date.setHours(0, 0, 0, 0);
 return new Date(date.getTime() - (date.getTimezoneOffset() * 60000));};
const toIST = (date) => {
  return new Date(date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
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

    if (!receiverNo || !machineNo || !date) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }

    if (!orderNo || orderNo < 1) {
      return res.status(400).json({
        success: false,
        message: "Order number must be greater than 0"
      });
    }
    const customer = await CustomerDetails.findOne({ receiverNo });
    if (!customer) {
      return res.status(404).json({ success: false, message: "Receiver number not found" });
    }
 // 🔥 Check receiver assignment duplication
    const activeProcess = await listProcess.findOne({
      receiverNo,
      status: { $ne: "Completed" }
    });

    if (activeProcess) {
      return res.status(400).json({
        success: false,
        message: `Receiver ${receiverNo} is already assigned to machine ${activeProcess.machineNo} and is not completed yet.`
      });
    }
    // -----------------------------------------
    // 🔥 Convert date to UTC midnight (IST logic)
    // -----------------------------------------
    const formattedDate = getLocalMidnight(date);

    // ------------------------------------------------------
    // 🔥 Check orderNo unique for same Machine + Same Date
    // ------------------------------------------------------
    const existingOrder = await listProcess.findOne({
      machineNo,
      orderNo,
      date: formattedDate   // same date only
    });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: `Order number ${orderNo} already exists for Machine ${machineNo} on this date`
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
      date: formattedDate,
    };

    const processEntry = await listProcess.create(processData);

    const responseEntry = {
      ...processEntry.toObject(),
      date: toIST(processEntry.date),
      createdAt: toIST(processEntry.createdAt),
      updatedAt: toIST(processEntry.updatedAt)
    };

    return res.status(201).json({
      success: true,
      message: "Fabric process created successfully",
      data: responseEntry
    });

  } catch (error) {
    console.error("Error creating fabric process:", error);
    return res.status(500).json({ success: false, message: "Server Error", error: error.message });
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
    const { id } = req.params;
    const { date, machineNo, shiftincharge, orderNo } = req.body;

    const userName = req.user?.name || "System";

    // 1️⃣ Get previous fabric process
    const previous = await listProcess.findById(id);
    if (!previous)
      return res.status(404).json({
        success: false,
        message: "Fabric process not found"
      });

    if (previous.status === "Pending")
      return res.status(400).json({
        success: false,
        message: "Cannot re-process. Process is still pending."
      });

    // 2️⃣ Get previous water usage cost
    const prevWater = await Water.findOne({ receiverNo: previous.receiverNo }).lean();
    const prevWaterCost = prevWater?.totalWaterCost || 0;

    /* =============================================================
       🔥 Smart Receiver NO + Cycle Logic (✓ No Duplicate Key)
    ============================================================= */

    // Step 1: Extract base receiver number correctly
    let baseReceiverNo = previous.receiverNo;

    // Remove RP- prefix if exists
    if (baseReceiverNo.startsWith("RP-")) {
      baseReceiverNo = baseReceiverNo.replace(/^RP-/, "");
    }

    // If receiver looks like R-1000-2 → convert to R-1000
    const parts = baseReceiverNo.split("-");
    if (parts.length > 2) {
      baseReceiverNo = `${parts[0]}-${parts[1]}`;
    }

    // Step 2: Scan database for max cycle
    const existing = await listProcess
      .find({ receiverNo: new RegExp(`^RP-${baseReceiverNo}-`) })
      .select("receiverNo");

    let maxCycle = 1;
    existing.forEach(item => {
      const seg = item.receiverNo.split("-");
      const cycle = parseInt(seg[seg.length - 1], 10);
      if (!isNaN(cycle) && cycle > maxCycle) maxCycle = cycle;
    });

    // Step 3: New cycle is max+1
    const newCycle = maxCycle + 1;

    // Step 4: Build new receiver number safely
    const newReceiverNo = `RP-${baseReceiverNo}-${newCycle}`;

    /* =============================================================
        🔁 Update Customer Receiver Mapping
    ============================================================= */
    await CustomerDetails.findOneAndUpdate(
      { receiverNo: previous.receiverNo },
      { receiverNo: newReceiverNo }
    );

    /* =============================================================
        🔁 Update old job status + history
    ============================================================= */
    await listProcess.findByIdAndUpdate(previous._id, {
      status: "Reprocess",
      $push: {
        history: {
          action: "Re-Process Started",
          changes: {
            from: previous.receiverNo,
            newReceiverNo,
            cycle: newCycle,
            prevWaterCost,
            previousOperators: previous.operator || []
          },
          user: userName
        }
      }
    });

    /* =============================================================
        ❌ Remove old assignment from operators
    ============================================================= */
    if (Array.isArray(previous.operator)) {
      for (const name of previous.operator) {
        await User.updateOne(
          { name },
          { $pull: { assignedFabrics: { fabricProcess: previous._id } } }
        );
      }
    }

    /* =============================================================
        🔢 Determine new order number
    ============================================================= */
    const lastTask = await listProcess
      .findOne({ operator: previous.operator, date: previous.date })
      .sort({ orderNo: -1 });

    const newOrderNo = lastTask ? lastTask.orderNo + 1 : 1;

    /* =============================================================
        ✨ Create new reprocess job
    ============================================================= */
    const newProcess = await listProcess.create({
      receiverNo: newReceiverNo,
      customer: previous.customer,
      date: date || previous.date,
      qty: previous.qty,
      machineNo: machineNo || previous.machineNo,
      rate: previous.rate,

      totalCost: previous.totalCost + prevWaterCost,
      waterCost: 0,
      shiftincharge: shiftincharge || previous.shiftincharge || [],

      orderNo: orderNo || newOrderNo,
      operator: previous.operator || [],
      cycle: newCycle,
      status: "Reprocess",

      history: [
        {
          action: "New Cycle Created",
          changes: {
            newReceiverNo,
            prevWaterCost,
            previousOperators: previous.operator || [],
            updatedFields: { date, machineNo, shiftincharge, orderNo }
          },
          user: userName
        }
      ]
    });

    /* =============================================================
        🔁 Assign new process to operators
    ============================================================= */
    if (Array.isArray(previous.operator)) {
      for (const name of previous.operator) {
        await User.updateOne(
          { name },
          {
            $push: {
              assignedFabrics: {
                fabricProcess: newProcess._id,
                receiverNo: newReceiverNo,
                status: "Reprocess",
                assignedDate: date || previous.date
              }
            }
          }
        );
      }
    }

    /* =============================================================
        🔁 Return populated response
    ============================================================= */
    const result = await listProcess.findById(newProcess._id).populate("customer");

    return res.status(201).json({
      success: true,
      message: "Re-process completed successfully",
      data: result
    });
  } catch (error) {
    console.error("Error during Re-Process:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ============================================================================
// PENDING FABRICS (LATEST PER RECEIVER)
============================================================================ */
export const getPendingFabricProcesses = async (req, res) => {
  try {
    const { machineNo, receiverNo } = req.query;

    let matchFilter = { status: { $in: ["Pending", "Reprocess"] } };

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
    let operatorName = req.query.operator || req.user?.name || null;
    const selectedDate = req.query.date ? new Date(req.query.date) : new Date();
    selectedDate.setHours(0, 0, 0, 0);

    let assignedData = [];

    if (operatorName && operatorName.trim() !== "") {
      const operator = await User.findOne({ name: new RegExp(`^${operatorName}$`, "i") }).lean();
      if (!operator)
        return res.status(404).json({ success: false, message: "Operator not found" });

      assignedData = operator.assignedFabrics.filter(a => {
        const assigned = new Date(a.assignedDate);
        assigned.setHours(0, 0, 0, 0);
        return a.status === "Pending" && assigned.getTime() === selectedDate.getTime();
      });
    } else {
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

    const ids = assignedData.map(a => a.fabricProcess);

    let fabrics = await listProcess.find({ _id: { $in: ids }, status: "Pending" })
      .populate("customer")
      .lean();

    fabrics.sort((a, b) => a.order - b.order);

    let first = false;
    fabrics = fabrics.map(f => {
      if (!first && f.status === "Pending") {
        first = true;
        f.canStart = true;
      } else {
        f.canStart = false;
      }
      return {
        ...f,
        date: toIST(f.date),
        createdAt: toIST(f.createdAt),
        updatedAt: toIST(f.updatedAt)
      };
    });

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

export const updateFabricProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fabric = await listProcess.findById(id);
    if (!fabric) {
      return res.status(404).json({
        success: false,
        message: "Process not found for this ID"
      });
    }

    const newOrderNo = updates.orderNo ?? fabric.orderNo;
    const newMachine = updates.machineNo ?? fabric.machineNo;
    const newDate = updates.date ? getLocalMidnight(updates.date) : fabric.date;

    // ---------------------------------------------------------
    // ❌ ORDER NO MUST NOT BE ZERO
    // ---------------------------------------------------------
    if (!newOrderNo || newOrderNo < 1) {
      return res.status(400).json({
        success: false,
        message: "Order number must be greater than 0"
      });
    }

    // ---------------------------------------------------------
    // 🔥 CHECK UNIQUE ORDER NO FOR SAME MACHINE + SAME DATE
    // ---------------------------------------------------------
    const existingOrder = await listProcess.findOne({
      _id: { $ne: id },
      machineNo: newMachine,
      date: newDate,
      orderNo: newOrderNo
    });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: `OrderNo ${newOrderNo} already exists for Machine ${newMachine} on this date`
      });
    }

    // ---------------------------------------------------------
    // 🔥 ORDER SHIFTING INSIDE SAME MACHINE + DATE
    // ---------------------------------------------------------
    if (updates.orderNo && updates.orderNo !== fabric.orderNo) {
      await listProcess.updateMany(
        {
          machineNo: newMachine,
          date: newDate,
          orderNo: { $gte: updates.orderNo }
        },
        {
          $inc: { orderNo: 1 }
        }
      );
    }

    // ---------------------------------------------------------
    // 🔥 RECEIVER NUMBER UPDATE
    // ---------------------------------------------------------
    if (updates.receiverNo && updates.receiverNo !== fabric.receiverNo) {
      await User.updateMany(
        { "assignedFabrics.receiverNo": fabric.receiverNo },
        { $set: { "assignedFabrics.$.receiverNo": updates.receiverNo } }
      );
    }

    // ---------------------------------------------------------
    // 🔥 APPLY UPDATES (including date conversion)
    // ---------------------------------------------------------
    if (updates.date) updates.date = newDate;
    Object.assign(fabric, updates);

    fabric.history.push({
      action: "Updated",
      changes: updates,
      user: req.user?.name || "System",
      date: new Date()
    });

    await fabric.save();

    return res.status(200).json({
      success: true,
      message: "Fabric process updated successfully",
      data: fabric
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export const deleteFabricProcess = async (req, res) => {
  try {
    const { id } = req.params;   // 🔥 Delete using _id

    const fabric = await listProcess.findById(id);
    if (!fabric) {
      return res.status(404).json({
        success: false,
        message: "Process not found for this ID"
      });
    }

    const receiverNo = fabric.receiverNo;
    const operator = fabric.operator;
    const order = fabric.order;

    // ------------------------------------
    // 🔥 REMOVE ASSIGNMENTS FROM OPERATORS
    // ------------------------------------
    await User.updateMany(
      {},
      { $pull: { assignedFabrics: { receiverNo } } }
    );

    // ------------------------------------
    // 🔥 DELETE PROCESS
    // ------------------------------------
    await listProcess.findByIdAndDelete(id);

    // ------------------------------------
    // 🔥 FIX ORDER OF REMAINING ITEMS
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

    // Fetch Fabric processes
    const list = await listProcess
      .find(filter)
      .sort({ order: 1 })
      .populate("customer");

    // Attach water info to each fabric
   const listWithWater = await Promise.all(
      list.map(async (fabric) => {
        const water = await Water.findOne({ receiverNo: fabric.receiverNo });
        return {
          ...fabric.toObject(),
          water: water ? water.toObject() : null
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: listWithWater.length,
      data: listWithWater
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
      return res.status(400).json({ success: false, message: "Machine number is required" });
    }

    const userRole = req.user?.role;
    let filter = { machineNo };
const todayRestrictedRoles = ["operator", "shiftincharge", "admin", "owner"];


    if (todayRestrictedRoles.includes(userRole)) {
      const today = getLocalMidnight(new Date());
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      filter.date = { $gte: today, $lt: tomorrow };
    }

    const fabricList = await listProcess.find(filter).sort({ orderNo: 1 }).lean();

    if (!fabricList.length) {
      return res.status(404).json({
        success: false,
        message: userRole === "operator"
          ? "No fabrics assigned today"
          : "No fabrics found for this machine"
      });
    }

    // Convert dates to IST
    const dataWithIST = fabricList.map(f => ({
      ...f,
      date: toIST(f.date),
      createdAt: toIST(f.createdAt),
      updatedAt: toIST(f.updatedAt)
    }));

    return res.status(200).json({
      success: true,
      machineNo,
      count: fabricList.length,
      data: dataWithIST
    });

  } catch (error) {
    console.error("Error fetching fabrics by machine:", error);
    return res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

export const getAllMachineReports = async (req, res) => {
  try {
    // 1️⃣ Load all machines from list.js
    const fabricProcesses = await listProcess.find();
    const machineToReceivers = {};

    for (const fp of fabricProcesses) {
      if (!machineToReceivers[fp.machineNo]) {
        machineToReceivers[fp.machineNo] = [];
      }
      machineToReceivers[fp.machineNo].push(fp.receiverNo);
    }

    // 2️⃣ Load ALL water records
    const waters = await Water.find().sort({ updatedAt: -1 });

    const machineReport = [];

    for (const machineNo of Object.keys(machineToReceivers)) {
      const receivers = machineToReceivers[machineNo];

      let latestWater = null;

      // 3️⃣ Pick latest water among multiple receiver numbers
      for (const rec of receivers) {
        const w = waters.find(w => w.receiverNo === rec);
        if (!w) continue;

        if (!latestWater || new Date(w.updatedAt) > new Date(latestWater.updatedAt)) {
          latestWater = w;
        }
      }

      // 4️⃣ No water yet → Pending
      if (!latestWater) {
        machineReport.push({
          machineNo,
          receiverNo: null,
          status: "Pending",
          operatorName: "-",
          companyName: "-",
          fabric: "-",
          color: "-",
          weight: "-",
          dia: "-",
          date: "-",
          runningTime: 0,
          startTimeFormatted: null,
          endTimeFormatted: null
        });
        continue;
      }

      // 5️⃣ Get customer details
      const customer = await CustomerDetails.findOne({
        receiverNo: latestWater.receiverNo
      });

      machineReport.push({
        machineNo,
        receiverNo: latestWater.receiverNo,
        status: latestWater.status,
        operatorName: latestWater.operator || latestWater.startedBy || "Unknown",
        companyName: customer?.companyName || "Unknown",
        fabric: customer?.fabric || null,
        color: customer?.color || null,
        weight: customer?.weight || null,
        dia: customer?.dia || null,
        date: latestWater.date
          ? new Date(latestWater.date).toLocaleDateString("en-IN")
          : "-",
        runningTime: latestWater.runningTime ?? 0,
        startTimeFormatted: latestWater.startTimeFormatted || null,
        endTimeFormatted: latestWater.endTimeFormatted || null
      });
    }

    // 6️⃣ Priority Sorting
    const priority = { Running: 1, Paused: 2, Freezed: 3, Completed: 4, Pending: 5 };

    machineReport.sort((a, b) => priority[a.status] - priority[b.status]);

    res.status(200).json({
      success: true,
      count: machineReport.length,
      data: machineReport
    });

  } catch (error) {
    console.log("MACHINE REPORT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};
const getDayRange = (inputDate) => {
  const date = inputDate ? new Date(inputDate) : new Date();
  date.setHours(0, 0, 0, 0);
  const start = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const getOperatorDashboard = async (req, res) => {
  try {
    const { date } = req.query; // optional date filter
    const { start, end } = getDayRange(date);

    // Fetch all work for all operators
    const work = await listProcess.find({
      status: { $in: ["Running", "Paused", "Stopped", "Reprocess", "Completed"] },
      date: { $gte: start, $lte: end }
    }).sort({ date: -1 });

    if (!work || work.length === 0) {
      return res.status(200).json({ message: "No work found for this date", data: [] });
    }

    const data = await Promise.all(work.map(async (item) => {
      const water = await Water.findOne({ receiverNo: item.receiverNo }).sort({ createdAt: -1 });
      const customer = await CustomerDetails.findOne({ receiverNo: item.receiverNo });

      return {
        operator: item.operator,                  // get operator(s) from listProcess
        machineNo: item.machineNo,
        receiverNo: item.receiverNo,
        runningTime: item.runningTime || 0,
        status: item.status,
        startTimeFormatted: water?.startTimeFormatted || "-",
        endTimeFormatted: water?.endTimeFormatted || "-",
        customer: {
          companyName: customer?.companyName || "Unknown",
          color: customer?.color || "-",
          weight: customer?.weight || "-"
        }
      };
    }));

    return res.status(200).json({
      message: "Operator dashboard fetched successfully",
      data
    });

  } catch (error) {
    console.error("OPERATOR DASHBOARD ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
export const getWaterIdByFabricProcessId = async (req, res) => {
  try {
    const { id } = req.params; // listProcess ID

    // 1. Find list process
    const fabricProcess = await listProcess.findById(id);

    if (!fabricProcess) {
      return res.status(404).json({
        message: "Fabric process not found"
      });
    }

    // 2. Extract receiverNo
    const receiverNo = fabricProcess.receiverNo;

    // 3. Match with Water collection
    const waterRecord = await Water.findOne({ receiverNo });

    return res.status(200).json({
      message: "Matched successfully",
      receiverNo,
      waterId: waterRecord ? waterRecord._id : null
    });

  } catch (error) {
    console.error("Lookup Error:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message
    });
  }
};