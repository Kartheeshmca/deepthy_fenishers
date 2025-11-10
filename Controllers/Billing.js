import Billing from "../Models/Billing.js";
import FabricProcess from "../Models/Fabric.js";

// ✅ Create Bill
export const createBill = async (req, res) => {
  try {
    const { items } = req.body;

    // 🔁 Auto-fill only color, lotWeight, and rate from FabricProcess using dcNo
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const fp = await FabricProcess.findOne({ dcNo: item.dcNo });
        if (fp) {
          return {
            ...item,
            color: fp.color || item.color, // only color
            lotWeight: fp.lotWeight || item.lotWeight, // only lotWeight
            rate: fp.rate || item.rate, // only rate
            amount: (fp.lotWeight || item.lotWeight) * (fp.rate || item.rate),
          };
        }
        return item;
      })
    );

    const bill = new Billing({ ...req.body, items: enrichedItems });
    await bill.save();

    res.status(201).json({
      success: true,
      message: "Bill created successfully",
      bill,
    });
  } catch (error) {
    console.error("Error creating bill:", error);
    res.status(500).json({
      success: false,
      message: "Error creating bill",
      error: error.message,
    });
  }
};

// ✅ Get All Bills
export const getAllBills = async (req, res) => {
  try {
    const bills = await Billing.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, bills });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Single Bill
export const getBillById = async (req, res) => {
  try {
    const bill = await Billing.findById(req.params.id);
    if (!bill)
      return res.status(404).json({ success: false, message: "Bill not found" });
    res.status(200).json({ success: true, bill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update Bill
export const updateBill = async (req, res) => {
  try {
    const updatedBill = await Billing.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updatedBill)
      return res.status(404).json({ success: false, message: "Bill not found" });

    res.status(200).json({
      success: true,
      message: "Bill updated successfully",
      updatedBill,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Delete Bill
export const deleteBill = async (req, res) => {
  try {
    const bill = await Billing.findByIdAndDelete(req.params.id);
    if (!bill)
      return res.status(404).json({ success: false, message: "Bill not found" });

    res.status(200).json({ success: true, message: "Bill deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Add download history (logged user)
export const addDownloadHistory = async (req, res) => {
  try {
    const { id } = req.params; // bill id
    const userId = req.user?._id; // from auth middleware

    const bill = await Billing.findById(id);
    if (!bill)
      return res.status(404).json({ success: false, message: "Bill not found" });

    bill.downloadHistory.push({ userId });
    await bill.save();

    res.status(200).json({ success: true, message: "Download recorded", bill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
