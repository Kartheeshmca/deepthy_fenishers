import FabricProcess from "../Models/Fabric.js";

// Helper to add history entry
const addHistory = (fabric, action, changes = {}, user = "System") => {
  fabric.history.push({ action, changes, user, date: new Date() });
};

// ✅ Start Fabric Process
export const createFabricProcess = async (req, res) => {
  try {
    const { dcNo, brandName, qty, color, machineNo, rate, A_D, user } = req.body;

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
    const { dcNo, openingReading, closingReading, lotWeight, chemicals = [], dyes = [], user } = req.body;

    if (!dcNo || openingReading == null || closingReading == null || lotWeight == null) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }
    if (openingReading < closingReading) {
      return res.status(400).json({ message: "Opening reading cannot be less than closing reading" });
    }

    const fabric = await FabricProcess.findOne({ dcNo });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });
    if (!fabric.startTime) return res.status(400).json({ message: "Process not started yet" });

    const changes = {};

    // Update readings and lotWeight
    fabric.openingReading = openingReading;
    fabric.closingReading = closingReading;
    fabric.lotWeight = lotWeight;
    fabric.endTime = new Date();

    if (fabric.endTime < fabric.startTime) {
      return res.status(400).json({ message: "End time cannot be before start time" });
    }

    // Running time in hours (rounded 2 decimals)
    fabric.runningTime = +((fabric.endTime - fabric.startTime) / (1000 * 60 * 60)).toFixed(2);

    // Water cost (rounded)
    fabric.waterCost = +(((openingReading - closingReading) / 100) * lotWeight * 0.4).toFixed(2);
    changes.readings = { openingReading, closingReading, lotWeight };
    changes.waterCost = fabric.waterCost;

    // Validate chemicals
    for (let chem of chemicals) {
      if (!chem.name || chem.qty == null || chem.qty < 0 || chem.cost == null || chem.cost < 0) {
        return res.status(400).json({ message: "Invalid chemical entry" });
      }
    }
    fabric.chemical = chemicals;
    changes.chemical = chemicals;

    // Validate dyes
    for (let dye of dyes) {
      if (!dye.name || dye.qty == null || dye.qty < 0 || dye.cost == null || dye.cost < 0) {
        return res.status(400).json({ message: "Invalid dye entry" });
      }
    }
    fabric.dyes = dyes;
    changes.dyes = dyes;

    // Total cost
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

// ✅ Get All Fabric Processes
export const getAllFabricProcesses = async (req, res) => {
  try {
    const fabrics = await FabricProcess.find().sort({ date: -1 });
    res.status(200).json(fabrics);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get by DC No
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

// ✅ Update Fabric Process
export const updateFabricProcess = async (req, res) => {
  try {
    const { dcNo } = req.params;
    const updates = req.body;

    const fabric = await FabricProcess.findOne({ dcNo });
    if (!fabric) return res.status(404).json({ message: "Fabric process not found" });

    const changes = { ...updates };
    addHistory(fabric, "Process Updated", changes, updates.user || "System");

    Object.assign(fabric, updates);

    await fabric.save();
    res.status(200).json({ message: "Fabric process updated", fabric });
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
    res.status(200).json({ message: "Fabric process deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
