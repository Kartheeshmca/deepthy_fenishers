// import FabricProcess from "../Models/Fabric.js";

// // Helper to add history
// const addHistory = (fabric, action, changes = {}, user = "System") => {
//   fabric.history.push({ action, changes, user, date: new Date() });
// };

// // ✅ Create a new Fabric Process (manual input)
// export const createFabricProcess = async (req, res) => {
//   try {
//     const {
//       dcNo,
//       brandName,
//       qty,
//       color,
//       machineNo,
//       rate,
//       lotWeight,

//       chemical = [],
//       dyes = [],
//     } = req.body;

//     const user = req.user?.name || "System";

//     // Validation
//     if (!dcNo || !brandName || !color || !machineNo)
//       return res.status(400).json({ message: "Missing required fields" });

//     if (qty < 0 || rate < 0 || lotWeight < 0)
//       return res.status(400).json({ message: "Numeric fields must be non-negative" });

//     const existing = await FabricProcess.findOne({ dcNo });
//     if (existing)
//       return res.status(400).json({ message: "Fabric process with this DC already exists" });

//     // Create new process
//     const fabric = new FabricProcess({
//       dcNo,
//       brandName,
//       qty,
//       color,
//       machineNo,
//       rate,
//       lotWeight,
//       waterCost: 0,
//       chemical,
//       dyes,
//       totalCost:0,
//       status: "Pending",
//       startTime: new Date(),
//       history: [
//         {
//           action: "Created",
//           user,
//           date: new Date(),
//           changes: { initialEntry: true },
//         },
//       ],
//     });

//     await fabric.save();
//     res.status(201).json({ message: "Fabric process started", fabric });
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Start Fabric Process (minimal fields)
// export const startFabricProcess = async (req, res) => {
//   try {
//     const { dcNo } = req.body;
//     const user = req.user?.name || "System";

//     const fabric = await FabricProcess.findOne({ dcNo });
//     if (!fabric) return res.status(404).json({ message: "Fabric process not found" });

//     if (fabric.status === "Running")
//       return res.status(400).json({ message: "Process already running" });
//     if (fabric.status === "Completed")
//       return res.status(400).json({ message: "Process already completed" });

//     fabric.startTime = new Date();
//     fabric.status = "Running";
//     addHistory(fabric, "Process Started", { started: true }, user);

//     await fabric.save();
//     res.status(200).json({ message: "Fabric process started successfully", fabric });
//   } catch (error) {
//     console.error("Error starting fabric process:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };


// // ✅ End Fabric Process
// export const endFabricProcess = async (req, res) => {
//   try {
//     const { dcNo, openingReading, closingReading, lotWeight, chemicals = [], dyes = [] } = req.body;
//     const user = req.user?.name || "System";

//     if (!dcNo || openingReading == null || closingReading == null || lotWeight == null)
//       return res.status(400).json({ message: "All required fields must be provided" });

//     if (closingReading < openingReading)
//       return res.status(400).json({ message: "Closing reading cannot be less than opening reading" });

//     const fabric = await FabricProcess.findOne({ dcNo });
//     if (!fabric) return res.status(404).json({ message: "Fabric process not found" });

// if (fabric.status !== "Running")
//   return res.status(400).json({ message: "Cannot end a process that hasn't started" });
//     const changes = {};
//     fabric.openingReading = openingReading;
//     fabric.closingReading = closingReading;
//     fabric.lotWeight = lotWeight;
//     fabric.endTime = new Date();

//     fabric.runningTime = +((fabric.endTime - fabric.startTime) / (1000 * 60 * 60)).toFixed(2);
//     fabric.waterCost = +(((closingReading - openingReading) / 100) * lotWeight * 0.4).toFixed(2);

//     // Validate and add chemicals
//     for (let chem of chemicals) {
//       if (!chem.name || chem.qty == null || chem.cost == null || chem.qty < 0 || chem.cost < 0)
//         return res.status(400).json({ message: "Invalid chemical entry" });
//     }
//     fabric.chemical = chemicals;

//     // Validate and add dyes
//     for (let dye of dyes) {
//       if (!dye.name || dye.qty == null || dye.cost == null || dye.qty < 0 || dye.cost < 0)
//         return res.status(400).json({ message: "Invalid dye entry" });
//     }
//     fabric.dyes = dyes;

//     const chemicalCost = chemicals.reduce((sum, c) => sum + c.cost, 0);
//     const dyeCost = dyes.reduce((sum, d) => sum + d.cost, 0);
//     fabric.totalCost = +(fabric.rate * fabric.qty + chemicalCost + dyeCost + fabric.waterCost).toFixed(2);

//     fabric.status = "Completed";
//     addHistory(fabric, "Process Ended", changes, user);

//     await fabric.save();
//     res.status(200).json({ message: "Fabric process completed", fabric });
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Update Process
// export const updateFabricProcess = async (req, res) => {
//   try {
//     const { dcNo } = req.params;
//     const updates = req.body;
//     const user = req.user?.name || "System";

//     const fabric = await FabricProcess.findOne({ dcNo });
//     if (!fabric) return res.status(404).json({ message: "Fabric process not found" });

//     const changes = {};
//     for (let key in updates) {
//       if (updates[key] !== undefined && Object.hasOwn(fabric, key)) {
//         changes[key] = { before: fabric[key], after: updates[key] };
//         fabric[key] = updates[key];
//       }
//     }

//     addHistory(fabric, "Process Updated", changes, user);
//     await fabric.save();
//     res.status(200).json({ message: "Fabric process updated", fabric });
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Get All Fabric Processes
// export const getAllFabricProcesses = async (req, res) => {
//   try {
//     const fabrics = await FabricProcess.find().sort({ createdAt: -1 });
//     res.status(200).json(fabrics);
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Get by DC No
// export const getFabricProcessByDcNo = async (req, res) => {
//   try {
//     const { dcNo } = req.params;
//     const fabric = await FabricProcess.findOne({ dcNo });
//     if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
//     res.status(200).json(fabric);
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Delete Fabric Process
// export const deleteFabricProcess = async (req, res) => {
//   try {
//     const { dcNo } = req.params;
//     const fabric = await FabricProcess.findOneAndDelete({ dcNo });
//     if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
//     res.status(200).json({ message: "Fabric process deleted successfully" });
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Search Fabric Processes
// export const searchFabricProcesses = async (req, res) => {
//   try {
//     const { dcNo, brandName, color, status, dateFrom, dateTo } = req.query;
//     const filter = {};

//     if (dcNo) filter.dcNo = { $regex: dcNo, $options: "i" };
//     if (brandName) filter.brandName = { $regex: brandName, $options: "i" };
//     if (color) filter.color = { $regex: color, $options: "i" };
//     if (status) filter.status = status;

//     if (dateFrom || dateTo) {
//       filter.createdAt = {};
//       if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
//       if (dateTo) filter.createdAt.$lte = new Date(dateTo);
//     }

//     const fabrics = await FabricProcess.find(filter).sort({ createdAt: -1 });
//     res.status(200).json(fabrics);
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Pagination
// export const getFabricProcessesPaginated = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;

//     const [fabrics, total] = await Promise.all([
//       FabricProcess.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
//       FabricProcess.countDocuments(),
//     ]);

//     res.status(200).json({
//       fabrics,
//       pagination: { current: page, pages: Math.ceil(total / limit), total },
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// // ✅ Export as CSV
// export const exportFabricProcessesCSV = async (req, res) => {
//   try {
//     const fabrics = await FabricProcess.find().sort({ createdAt: -1 });
//     if (!fabrics.length) return res.status(404).json({ message: "No fabric processes found" });

//     const csvData = fabrics.map(fabric => ({
//       DC_No: fabric.dcNo,
//       Date: fabric.createdAt ? fabric.createdAt.toISOString().split("T")[0] : "",
//       Brand: fabric.brandName,
//       Quantity: fabric.qty,
//       Color: fabric.color,
//       Machine: fabric.machineNo,
//       Status: fabric.status,
//       Total_Cost: fabric.totalCost,
//     }));

//     const csvString = [
//       Object.keys(csvData[0]).join(","),
//       ...csvData.map(row => Object.values(row).join(",")),
//     ].join("\n");

//     res.setHeader("Content-Type", "text/csv");
//     res.setHeader("Content-Disposition", "attachment; filename=fabric-processes.csv");
//     res.send(csvString);
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };
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
    fabric.waterCost = +(((closingReading - openingReading) / 100) * lotWeight * 0.4).toFixed(2);

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
    const fabrics = await FabricProcess.find().sort({ createdAt: -1 });
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

// ✅ Export as CSV
export const exportFabricProcessesCSV = async (req, res) => {
  try {
    const fabrics = await FabricProcess.find().sort({ createdAt: -1 });
    if (!fabrics.length) return res.status(404).json({ message: "No fabric processes found" });

    const csvData = fabrics.map(fabric => ({
      DC_No: fabric.dcNo,
      Cycle: fabric.cycle,
      Date: fabric.createdAt ? fabric.createdAt.toISOString().split("T")[0] : "",
      Brand: fabric.brandName,
      Quantity: fabric.qty,
      Color: fabric.color,
      Machine: fabric.machineNo,
      Status: fabric.status,
      Total_Cost: fabric.totalCost,
    }));

    const csvString = [
      Object.keys(csvData[0]).join(","),
      ...csvData.map(row => Object.values(row).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=fabric-processes.csv");
    res.send(csvString);
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
