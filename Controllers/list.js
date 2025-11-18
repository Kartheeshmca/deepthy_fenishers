import listProcess from "../Models/list.js";

/* -----------------------------
   Helpers
-----------------------------*/
const requireAdmin = (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "owner") {
    res.status(403).json({ message: "Admin/Owner access required" });
    return false;
  }
  return true;
};

// Add history entry
const addHistory = (doc, action, changes = {}, user = "System") => {
  doc.history = doc.history || [];
  doc.history.push({ action, changes, user, timestamp: new Date() });
};

// Recalculate total cost
// Recalculate total cost
const updateTotalCost = (doc) => {
  // Base fabric cost = rate x qty
  const baseCost = Number((doc.rate * doc.qty).toFixed(2));

  // Water cost
  const waterCost = Number((doc.waterProcess?.totalWaterCost || 0).toFixed(2));

  // Chemicals total
  const chemicalTotal = doc.chemical?.reduce((sum, c) => sum + (c.cost || 0), 0) || 0;

  // Dyes total
  const dyeTotal = doc.dyes?.reduce((sum, d) => sum + (d.cost || 0), 0);

  // Update document totalCost
  doc.totalCost = {
    total: Number((baseCost + waterCost + chemicalTotal + dyeTotal).toFixed(2)),
    baseCost,
    waterCost,
    chemicalCost: Number(chemicalTotal.toFixed(2)),
    dyeCost: Number(dyeTotal.toFixed(2)),
  };
};


/* -----------------------------
   Get Customer by Receiver No
-----------------------------*/
export const getCustomerByReceiverNoExpanded = async (req, res) => {
  try {
    const { receiverNo } = req.query;
    if (!receiverNo) return res.status(400).json({ message: "receiverNo is required" });

    const customerProcess = await listProcess.findOne({
      "customerDetails.receiverNo": receiverNo
    }).sort({ createdAt: -1 }).lean();

    if (!customerProcess) return res.status(404).json({ message: "Customer not found" });

    res.json({ customerDetails: customerProcess.customerDetails });
  } catch (err) {
    res.status(500).json({ message: "Error fetching customer", error: err.message });
  }
};

/* -----------------------------
   Create Fabric Process
-----------------------------*/
export const createProcessWithCustomer = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { dcNo, machineNo, qty, rate, receiverNo, lotWeight } = req.body;
    if (!dcNo || !machineNo || !qty || !rate || !receiverNo)
      return res.status(400).json({ message: "Missing required fields" });

    const customerProcess = await listProcess.findOne({
      "customerDetails.receiverNo": receiverNo
    }).sort({ createdAt: -1 });

    if (!customerProcess) return res.status(404).json({ message: "Customer not found" });

    // Increment cycle if same DC exists
    const lastProcess = await listProcess.findOne({ dcNo }).sort({ cycle: -1 });
    const cycle = lastProcess ? lastProcess.cycle + 1 : 1;

    const totalCost = Number((rate * qty).toFixed(2)); // calculate total cost

    const newProcess = new listProcess({
      dcNo,
      cycle,
      machineNo,
      qty,
      rate,
      lotWeight,
      customerDetails: customerProcess.customerDetails,
      waterProcess: { status: "Pending", totalWaterCost: 0 },
      chemical: [],
      dyes: [],
      chemicalCost: 0,
      dyeCost: 0,
      totalCost,  // set initial total cost as rate x qty
      status: "Pending",
      history: []
    });

    addHistory(newProcess, "Process Created", { dcNo, cycle, totalCost }, req.user?.name);
    await newProcess.save();

    res.status(201).json({ message: "Fabric process created", process: newProcess });
  } catch (err) {
    res.status(500).json({ message: "Create failed", error: err.message });
  }
};
export const createCustomerDetails = async (req, res) => {
  try {
    const {
      companyName,
      customerName,
      receiverNo,
      fabric,
      color,
      dia,
      roll,
      weight,
      partyDcNo,
      date,
    } = req.body;

    /* -----------------------------
       VALIDATION SECTION
    -----------------------------*/

    // Required fields
    if (!companyName || companyName.trim() === "") {
      return res.status(400).json({ message: "companyName is required" });
    }

    // Validate strings (optional but should not be empty)
    const stringFields = { customerName, receiverNo, fabric, color, dia, partyDcNo };
    for (const [field, value] of Object.entries(stringFields)) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ message: `${field} must be a string` });
      }
    }

    // Validate roll (number)
    if (roll !== undefined) {
      if (typeof roll !== "number" || roll < 0) {
        return res.status(400).json({ message: "roll must be a positive number" });
      }
    }

    // Validate weight (number)
    if (weight !== undefined) {
      if (typeof weight !== "number" || weight < 0) {
        return res.status(400).json({ message: "weight must be a positive number" });
      }
    }

    // Validate date
    if (date && isNaN(Date.parse(date))) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    /* -----------------------------
       SAVE DATA INTO DATABASE
    -----------------------------*/

    const newEntry = new CustomerDetails({
      companyName: companyName.trim(),
      customerName: customerName?.trim(),
      receiverNo: receiverNo?.trim(),
      fabric: fabric?.trim(),
      color: color?.trim(),
      dia: dia?.trim(),
      roll,
      weight,
      partyDcNo: partyDcNo?.trim(),
      date,
    });

    await newEntry.save();

    return res.status(201).json({
      message: "Customer details saved successfully",
      data: newEntry,
    });

  } catch (error) {
    console.error("Error while saving customer details:", error);
    return res.status(500).json({
      message: "Server error while adding details",
      error: error.message,
    });
  }
};
/* -----------------------------
   Start / Resume Water Process
-----------------------------*/
export const startProcess = async (req, res) => {
  try {
    const { dcNo, openingReading, machineNo, remarks } = req.body;
    if (!dcNo || openingReading == null || !machineNo)
      return res.status(400).json({ message: "DC No, openingReading, machineNo required" });

    const process = await listProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!process) return res.status(404).json({ message: "Process not found" });

    if (process.waterProcess?.status === "Running")
      return res.status(400).json({ message: "Process already running" });

    // If paused, continue from last closingReading
    const lastReading = process.waterProcess?.closingReading ?? openingReading;

    process.waterProcess.openingReading = lastReading;
    process.waterProcess.startTime = new Date();
    process.waterProcess.remarks = remarks;
    process.waterProcess.status = "Running";
    process.status = "Running";

    addHistory(process, process.waterProcess?.status === "Paused" ? "Process Resumed (Reprocess)" : "Process Started",
      { openingReading: lastReading, machineNo, remarks }, req.user?.name);

    await process.save();
    res.json({ message: "Process started/resumed (Reprocess)", process });
  } catch (err) {
    res.status(500).json({ message: "Start failed", error: err.message });
  }
};

/* -----------------------------
   Stop / Pause Water Process
-----------------------------*/
export const stopProcess = async (req, res) => {
  try {
    const { dcNo, closingReading, pause } = req.body;
    if (!dcNo || closingReading == null)
      return res.status(400).json({ message: "DC No & closingReading required" });

    const process = await listProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!process) return res.status(404).json({ message: "Process not found" });
    if (process.waterProcess?.status !== "Running")
      return res.status(400).json({ message: "Process not running" });

    // Calculate water used
    const waterUsed = closingReading - process.waterProcess.openingReading;
    if (waterUsed < 0)
      return res.status(400).json({ message: "Closing reading cannot be less than opening reading" });
    if (!process.lotWeight || process.lotWeight === 0)
      return res.status(400).json({ message: "Lot weight must be greater than 0" });

    // Update water process info
    process.waterProcess.closingReading = closingReading;
    process.waterProcess.endTime = new Date();
    process.waterProcess.runningTime = +(
      (process.waterProcess.endTime - process.waterProcess.startTime) /
      (1000 * 60 * 60)
    ).toFixed(2);

    // Water cost calculation
    const newWaterCost = +((-(process.waterProcess.openingReading - closingReading) / process.lotWeight) * 0.4).toFixed(2);
    process.waterProcess.totalWaterCost = (process.waterProcess.totalWaterCost || 0) + newWaterCost;

    // Update status
    process.waterProcess.status = pause ? "Paused" : "Completed";
    process.status = pause ? "Paused" : "Completed";

    addHistory(
      process,
      pause ? "Process Paused (Reprocess)" : "Process Stopped & Water Cost Calculated",
      { closingReading, runningTime: process.waterProcess.runningTime, waterCost: newWaterCost },
      req.user?.name
    );

    // Update total cost object including chemicals, dyes, and water
    const chemicalItems = process.chemical?.map(c => ({ name: c.name, cost: c.cost })) || [];
    const dyeItems = process.dyes?.map(d => ({ name: d.name, cost: d.cost })) || [];
    const chemicalTotal = chemicalItems.reduce((sum, c) => sum + c.cost, 0);
    const dyeTotal = dyeItems.reduce((sum, d) => sum + d.cost, 0);
    const waterTotal = process.waterProcess.totalWaterCost || 0;

    process.totalCost = {
      total: Number((chemicalTotal + dyeTotal + waterTotal).toFixed(2)),
      waterCost: Number(waterTotal.toFixed(2)),
      chemicals: chemicalItems,
      dyes: dyeItems
    };

    await process.save();

    res.json({
      message: `Process ${pause ? "paused for reprocess" : "stopped & water cost updated"}`,
      process
    });
  } catch (err) {
    res.status(500).json({ message: "Stop failed", error: err.message });
  }
};

/* -----------------------------
   Add Chemical (Admin/Owner)
-----------------------------*/
export const addChemical = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { dcNo } = req.params;
    const item = req.body;

    if (!item.name || item.qty == null || item.cost == null)
      return res.status(400).json({ message: "Chemical name, qty, and cost are required" });

    const process = await listProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!process) return res.status(404).json({ message: "Process not found" });

    process.chemical.push({ ...item, addedAt: new Date() });
    process.chemicalCost = (process.chemicalCost || 0) + Number(item.cost);

    updateTotalCost(process);
    addHistory(process, "Chemical added", item, req.user?.name);

    await process.save();
    res.json({ message: "Chemical added", process });
  } catch (err) {
    res.status(500).json({ message: "Add chemical failed", error: err.message });
  }
};

/* -----------------------------
   Add Dye (Admin/Owner)
-----------------------------*/
export const addDye = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { dcNo } = req.params;
    const item = req.body;

    if (!item.name || item.qty == null || item.cost == null)
      return res.status(400).json({ message: "Dye name, qty, and cost are required" });

    const process = await listProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!process) return res.status(404).json({ message: "Process not found" });

    process.dyes.push({ ...item, addedAt: new Date() });
    process.dyeCost = (process.dyeCost || 0) + Number(item.cost);

    updateTotalCost(process);
    addHistory(process, "Dye added", item, req.user?.name);

    await process.save();
    res.json({ message: "Dye added", process });
  } catch (err) {
    res.status(500).json({ message: "Add dye failed", error: err.message });
  }
};

/* -----------------------------
   List Fabric Processes
-----------------------------*/
export const listProcesses = async (req, res) => {
  try {
    const { receiverNo, dcNo, status } = req.query;
    const filter = {};
    if (receiverNo) filter["customerDetails.receiverNo"] = receiverNo;
    if (dcNo) filter.dcNo = dcNo;
    if (status) filter.status = status;

    const processes = await listProcess.find(filter).sort({ createdAt: -1 });
    res.json(processes);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};
export const getFabricByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ message: "User ID required" });

    const processes = await NodeListProcess.find({ "customerDetails.userId": userId }).sort({ createdAt: -1 });
    res.json(processes);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};

/* -----------------------------
   Get Latest Fabric Per DC
-----------------------------*/
export const getLatestFabricPerDC = async (req, res) => {
  try {
    const latestProcesses = await listProcess.aggregate([
      { $sort: { cycle: -1, createdAt: -1 } },
      {
        $group: {
          _id: "$dcNo",
          latestProcess: { $first: "$$ROOT" }
        }
      }
    ]);

    res.json(latestProcesses.map(p => p.latestProcess));
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};

/* -----------------------------
   Paginated Fabric Processes
-----------------------------*/
export const getFabricProcessesPaginated = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const total = await listProcess.countDocuments();
    const processes = await listProcess.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      page: Number(page),
      limit: Number(limit),
      total,
      processes
    });
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
};

/* -----------------------------
   Search Fabric Processes
-----------------------------*/
export const searchFabricProcesses = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: "Query is required" });

    const regex = new RegExp(query, "i");
    const processes = await listProcess.find({
      $or: [
        { "customerDetails.customerName": regex },
        { "customerDetails.receiverNo": regex },
        { dcNo: regex },
        { machineNo: regex },
        { status: regex }
      ]
    }).sort({ createdAt: -1 });

    res.json(processes);
  } catch (err) {
    res.status(500).json({ message: "Search failed", error: err.message });
  }
};

/* -----------------------------
   Delete Fabric Process
-----------------------------*/
export const deleteFabricProcess = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { dcNo } = req.params;
    const process = await listProcess.findOneAndDelete({ dcNo });
    if (!process) return res.status(404).json({ message: "Process not found" });

    res.json({ message: "Process deleted", process });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

/* -----------------------------
   Update Fabric Process
-----------------------------*/
export const updateFabricProcess = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { dcNo } = req.params;
    const updates = req.body;

    const process = await listProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!process) return res.status(404).json({ message: "Process not found" });

    Object.assign(process, updates);
    addHistory(process, "Process Updated", updates, req.user?.name);

    updateTotalCost(process);
    await process.save();

    res.json({ message: "Process updated", process });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
};

/* -----------------------------
   Get Customer by Receiver No (Expanded)
-----------------------------*/
export const getCustomerByReceiverNo = async (req, res) => {
  try {
    const { receiverNo } = req.query;
    if (!receiverNo) return res.status(400).json({ message: "receiverNo is required" });

    const customerProcess = await listProcess.findOne({
      "customerDetails.receiverNo": receiverNo
    }).sort({ createdAt: -1 }).lean();

    if (!customerProcess) return res.status(404).json({ message: "Customer not found" });

    res.json({
      customerDetails: customerProcess.customerDetails,
      latestProcess: customerProcess
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching customer", error: err.message });
  }
};