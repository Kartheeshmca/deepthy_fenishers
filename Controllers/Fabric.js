import FabricProcess from "../Models/Fabric.js";

// 🧠 Helper: Add History Log
const addHistory = (fabric, action, changes = {}, user = "System") => {
  fabric.history.push({ action, changes, user, date: new Date() });
};

// ✅ Create a New Fabric Process (Manual Input)
export const createFabricProcess = async (req, res) => {
  try {
    const {
      dcNo,
      brandName,
      qty,
      color,
      machineNo,
      rate,
      lotWeight,
      chemical = [],
      dyes = [],
    } = req.body;

    const user = req.user?.name || "System";

    if (!dcNo || !brandName || !color || !machineNo)
      return res.status(400).json({ message: "Missing required fields" });

    if (qty < 0 || rate < 0 || lotWeight < 0)
      return res.status(400).json({ message: "Numeric fields must be non-negative" });

    // 🔁 Count how many times this DC was processed before
    const count = await FabricProcess.countDocuments({ dcNo });

    const fabric = new FabricProcess({
      dcNo,
      cycle: count + 1, // ✅ Track re-runs
      brandName,
      qty,
      color,
      machineNo,
      rate,
      lotWeight,
      waterCost: 0,
      chemical,
      dyes,
      totalCost: 0,
      status: "Pending",
      startTime: new Date(),
      history: [
        {
          action: "Created",
          user,
          date: new Date(),
          changes: { initialEntry: true, cycle: count + 1 },
        },
      ],
    });

    await fabric.save();
    res.status(201).json({
      message: `Fabric process started for DC ${dcNo} (Cycle ${count + 1})`,
      fabric,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Start Fabric Process
export const startFabricProcess = async (req, res) => {
  try {
    const { dcNo, openingReading } = req.body;
    const user = req.user?.name || "System";

    // Always fetch latest cycle
    const fabric = await FabricProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });

    if (fabric.status === "Running")
      return res.status(400).json({ message: "Process already running" });
    if (fabric.status === "Completed")
      return res.status(400).json({ message: "Process already completed" });

    fabric.startTime = new Date();
    fabric.openingReading = openingReading;
    fabric.status = "Running";
    addHistory(fabric, "Process Started", { started: true, openingReading }, user);

    await fabric.save();
    res.status(200).json({ message: "Fabric process started successfully", fabric });
  } catch (error) {
    console.error("Error starting fabric process:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ End Fabric Process
export const endFabricProcess = async (req, res) => {
  try {
    const { dcNo, openingReading, closingReading, lotWeight, chemicals = [], dyes = [] } = req.body;
    const user = req.user?.name || "System";

    if (!dcNo || openingReading == null || closingReading == null || lotWeight == null)
      return res.status(400).json({ message: "All required fields must be provided" });

    if (closingReading < openingReading)
      return res.status(400).json({ message: "Closing reading cannot be less than opening reading" });

    const fabric = await FabricProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
    if (fabric.status !== "Running")
      return res.status(400).json({ message: "Cannot end a process that hasn't started" });

    const changes = {};
    fabric.openingReading = openingReading;
    fabric.closingReading = closingReading;
    fabric.lotWeight = lotWeight;
    fabric.endTime = new Date();

    fabric.runningTime = +((fabric.endTime - fabric.startTime) / (1000 * 60 * 60)).toFixed(2);
    fabric.waterCost = -(((openingReading-closingReading))* lotWeight * 0.4).toFixed(2);

    // ✅ Validate and add chemicals
    for (let chem of chemicals) {
      if (!chem.name || chem.qty == null || chem.cost == null || chem.qty < 0 || chem.cost < 0)
        return res.status(400).json({ message: "Invalid chemical entry" });
    }
    fabric.chemical = chemicals;

    // ✅ Validate and add dyes
    for (let dye of dyes) {
      if (!dye.name || dye.qty == null || dye.cost == null || dye.qty < 0 || dye.cost < 0)
        return res.status(400).json({ message: "Invalid dye entry" });
    }
    fabric.dyes = dyes;

    const chemicalCost = chemicals.reduce((sum, c) => sum + c.cost, 0);
    const dyeCost = dyes.reduce((sum, d) => sum + d.cost, 0);
    fabric.totalCost = +(fabric.rate * fabric.qty + chemicalCost + dyeCost + fabric.waterCost).toFixed(2);

    fabric.status = "Completed";
    addHistory(fabric, "Process Ended", changes, user);

    await fabric.save();
    res.status(200).json({ message: "Fabric process completed", fabric });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Update Process
export const updateFabricProcess = async (req, res) => {
  try {
    const { dcNo } = req.params;
    const updates = req.body;
    const user = req.user?.name || "System";

    const fabric = await FabricProcess.findOne({ dcNo }).sort({ cycle: -1 });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });

    const changes = {};
    for (let key in updates) {
      if (updates[key] !== undefined && Object.hasOwn(fabric, key)) {
        changes[key] = { before: fabric[key], after: updates[key] };
        fabric[key] = updates[key];
      }
    }

    addHistory(fabric, "Process Updated", changes, user);
    await fabric.save();
    res.status(200).json({ message: "Fabric process updated", fabric });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get All Fabric Processes
export const getAllFabricProcesses = async (req, res) => {
  try {
    const { role, name } = req.user; // get from auth middleware
    let query = {};

    if (role === "user") {
      query.user = name; // ✅ only show records created by this user
    }

    const fabrics = await FabricProcess.find(query).sort({ createdAt: -1 });
    res.status(200).json(fabrics);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get All Cycles by DC No
export const getFabricProcessByDcNo = async (req, res) => {
  try {
    const { dcNo } = req.params;

    const fabrics = await FabricProcess.find({ dcNo }).sort({ cycle: 1 });

    if (!fabrics.length)
      return res.status(404).json({ message: "No fabric processes found for this DC" });

    res.status(200).json({
      dcNo,
      totalCycles: fabrics.length,
      cycles: fabrics,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Delete Fabric Process (Latest Cycle)
export const deleteFabricProcess = async (req, res) => {
  try {
    const { dcNo } = req.params;
    const fabric = await FabricProcess.findOneAndDelete({ dcNo }).sort({ cycle: -1 });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
    res.status(200).json({ message: "Latest cycle deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Search Fabric Processes
export const searchFabricProcesses = async (req, res) => {
  try {
    const { dcNo, brandName, color, status, dateFrom, dateTo } = req.query;
    const filter = {};

    if (dcNo) filter.dcNo = { $regex: dcNo, $options: "i" };
    if (brandName) filter.brandName = { $regex: brandName, $options: "i" };
    if (color) filter.color = { $regex: color, $options: "i" };
    if (status) filter.status = status;

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const fabrics = await FabricProcess.find(filter).sort({ createdAt: -1 });
    res.status(200).json(fabrics);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Pagination
export const getFabricProcessesPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [fabrics, total] = await Promise.all([
      FabricProcess.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      FabricProcess.countDocuments(),
    ]);

    res.status(200).json({
      fabrics,
      pagination: { current: page, pages: Math.ceil(total / limit), total },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// ✅ Get Latest Process per DC (Summary)
export const getLatestFabricPerDC = async (req, res) => {
  try {
    const latest = await FabricProcess.aggregate([
      { $sort: { dcNo: 1, cycle: -1 } },
      {
        $group: {
          _id: "$dcNo",
          latest: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$latest" } },
      { $sort: { createdAt: -1 } },
    ]);

    res.status(200).json(latest);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get all DC work done by a specific user — full history + summary
export const getFabricByUser = async (req, res) => {
  try {
    const { username } = req.params;
    if (!username)
      return res.status(400).json({ message: "Username is required" });

    // 🔍 Find all fabric processes where this user appeared in history
    const fabrics = await FabricProcess.find({
      "history.user": { $regex: new RegExp(username, "i") }
    }).sort({ createdAt: -1 });

    if (!fabrics.length)
      return res.status(404).json({ message: `No records found for user: ${username}` });

    // 🧾 Build details per DC
    const workDetails = fabrics.map(fab => {
      // Filter only the actions done by this user
      const userActions = fab.history.filter(
        h => h.user?.toLowerCase() === username.toLowerCase()
      );

      const lastAction = userActions[userActions.length - 1];

      return {
        dcNo: fab.dcNo,
        cycle: fab.cycle,
        brandName: fab.brandName,
        color: fab.color,
        machineNo: fab.machineNo,
        status: fab.status,
        waterCost: fab.waterCost,
        totalCost: fab.totalCost,

        // 🕒 All actions this user did in this DC
        actionsPerformed: userActions.map(act => ({
          action: act.action,
          date: act.date,
          remarks: act.remarks || "—"
        })),

        // 🏁 Last action summary
        lastAction: {
          action: lastAction?.action || "N/A",
          date: lastAction?.date || null
        }
      };
    });

    // 📊 Summary for user
    const summary = {
      totalProcesses: fabrics.length,
      totalCompleted: fabrics.filter(f => f.status === "Completed").length,
      totalRunning: fabrics.filter(f => f.status === "Running").length,
      totalPending: fabrics.filter(f => f.status === "Pending").length,
      totalWaterCost: fabrics.reduce((sum, f) => sum + (f.waterCost || 0), 0),
      totalFabricCost: fabrics.reduce((sum, f) => sum + (f.totalCost || 0), 0),
      totalActions: workDetails.reduce((sum, f) => sum + f.actionsPerformed.length, 0),
      lastWorkedOn:
        workDetails
          .flatMap(f => f.actionsPerformed)
          .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date || null
    };

    res.status(200).json({
      user: username,
      summary,
      workDetails
    });

  } catch (error) {
    console.error("Error fetching user work history:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
