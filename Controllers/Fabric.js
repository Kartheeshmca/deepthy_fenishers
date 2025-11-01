import FabricProcess from "../Models/Fabric.js";

// Helper to add history entry
const addHistory = (fabric, action, changes = {}, user = "System") => {
  fabric.history.push({ action, changes, user, date: new Date() });
};

// ✅ Start Fabric Process
export const createFabricProcess = async (req, res) => {
  try {
    const { dcNo, brandName, qty, color, machineNo, rate, A_D } = req.body;
    const user = req.user.name;

    if (!dcNo || !brandName || qty == null || qty < 0 || !color || !machineNo || rate == null || rate < 0) {
      return res.status(400).json({ message: "Invalid or missing required fields" });
    }

    const existing = await FabricProcess.findOne({ dcNo });
    if (existing) return res.status(400).json({ message: "Fabric process with this DC already exists" });

    const fabric = new FabricProcess({
      dcNo,
      brandName,
      qty,
      color,
      machineNo,
      rate,
      A_D,
      startTime: new Date(),
      status: "Running"
    });

    addHistory(fabric, "Process Started", { dcNo, brandName, qty, color, machineNo, rate, A_D }, user);

    await fabric.save();
    res.status(201).json({ message: "Fabric process started", fabric });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ End Fabric Process
export const endFabricProcess = async (req, res) => {
  try {
    const { dcNo, openingReading, closingReading, lotWeight, chemicals = [], dyes = [] } = req.body;
    const user = req.user.name;

    if (!dcNo || openingReading == null || closingReading == null || lotWeight == null) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }
    if (closingReading < openingReading) return res.status(400).json({ message: "Closing reading cannot be less than opening reading" });

    const fabric = await FabricProcess.findOne({ dcNo });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
    if (!fabric.startTime) return res.status(400).json({ message: "Process not started yet" });

    const changes = {};
    fabric.openingReading = openingReading;
    fabric.closingReading = closingReading;
    fabric.lotWeight = lotWeight;
    fabric.endTime = new Date();

    fabric.runningTime = +((fabric.endTime - fabric.startTime) / (1000 * 60 * 60)).toFixed(2);
    fabric.waterCost = +(((closingReading - openingReading) / 100) * lotWeight * 0.4).toFixed(2);

    changes.readings = { openingReading, closingReading, lotWeight };
    changes.waterCost = fabric.waterCost;

    for (let chem of chemicals) {
      if (!chem.name || chem.qty == null || chem.qty < 0 || chem.cost == null || chem.cost < 0) {
        return res.status(400).json({ message: "Invalid chemical entry" });
      }
    }
    fabric.chemical = chemicals;
    changes.chemical = chemicals;

    for (let dye of dyes) {
      if (!dye.name || dye.qty == null || dye.qty < 0 || dye.cost == null || dye.cost < 0) {
        return res.status(400).json({ message: "Invalid dye entry" });
      }
    }
    fabric.dyes = dyes;
    changes.dyes = dyes;

    const chemicalCost = chemicals.reduce((sum, c) => sum + c.cost, 0);
    const dyeCost = dyes.reduce((sum, d) => sum + d.cost, 0);
    fabric.totalCost = +(fabric.rate * fabric.qty + chemicalCost + dyeCost + fabric.waterCost).toFixed(2);
    changes.totalCost = fabric.totalCost;

    fabric.status = "Completed";
    addHistory(fabric, "Process Ended", changes, user);

    await fabric.save();
    res.status(200).json({ message: "Fabric process completed", fabric });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Update Fabric Process
export const updateFabricProcess = async (req, res) => {
  try {
    const { dcNo } = req.params;
    const updates = req.body;
    const user = req.user.name;

    const fabric = await FabricProcess.findOne({ dcNo });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });

    const changes = {};
    for (let key in updates) {
      if (updates[key] !== undefined && key in fabric) {
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
    const fabrics = await FabricProcess.find().sort({ date: -1 });
    res.status(200).json(fabrics);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get Fabric Process by DC No
export const getFabricProcessByDcNo = async (req, res) => {
  try {
    const { dcNo } = req.params;
    const fabric = await FabricProcess.findOne({ dcNo });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
    res.status(200).json(fabric);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Delete Fabric Process
export const deleteFabricProcess = async (req, res) => {
  try {
    const { dcNo } = req.params;
    const fabric = await FabricProcess.findOneAndDelete({ dcNo });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
    res.status(200).json({ message: "Fabric process deleted successfully" });
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
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) filter.date.$lte = new Date(dateTo);
    }

    const fabrics = await FabricProcess.find(filter).sort({ date: -1 });
    res.status(200).json(fabrics);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// ✅ Get All Fabric Processes with Pagination
export const getFabricProcessesPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [fabrics, total] = await Promise.all([
      FabricProcess.find().sort({ date: -1 }).skip(skip).limit(limit),
      FabricProcess.countDocuments()
    ]);

    res.status(200).json({
      fabrics,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Export Fabric Processes as CSV
export const exportFabricProcessesCSV = async (req, res) => {
  try {
    const fabrics = await FabricProcess.find().sort({ date: -1 });

    if (!fabrics.length) return res.status(404).json({ message: "No fabric processes found" });

    const csvData = fabrics.map(fabric => ({
      DC_No: fabric.dcNo,
      Date: fabric.date ? fabric.date.toISOString().split('T')[0] : '',
      Brand: fabric.brandName,
      Quantity: fabric.qty,
      Color: fabric.color,
      Machine: fabric.machineNo,
      Status: fabric.status,
      Total_Cost: fabric.totalCost
    }));

    const csvString = [
      Object.keys(csvData[0]).join(','), // headers
      ...csvData.map(row => Object.values(row).join(',')) // rows
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=fabric-processes.csv');
    res.send(csvString);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
