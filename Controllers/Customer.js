import CustomerDetails from "../Models/Customer.js";

export const createCustomerDetails = async (req, res) => {
  try {
    const {
      receiverNo,
      companyName,
      customerName,
      fabric,
      color,
      dia,
      roll,
      weight,
      partyDcNo,
      date,
    } = req.body;

    if (!companyName || companyName.trim() === "") {
      return res.status(400).json({ message: "Company Name is required" });
    }

    // Validate unique partyDcNo per company
    const existingDC = await CustomerDetails.findOne({ companyName, partyDcNo });
    if (existingDC) {
      return res.status(400).json({ message: `DC No ${partyDcNo} already exists for ${companyName}` });
    }

    let finalReceiverNo = receiverNo;

    if (!receiverNo) {
      // Auto-generate receiverNo
      const allCustomers = await CustomerDetails.find({}).lean();

      if (allCustomers.length > 0) {
        // Extract numeric parts of existing receiverNos
        const numbers = allCustomers.map(c => {
          const parts = c.receiverNo?.split("-");
          return parts && parts[1] ? parseInt(parts[1]) : 0;
        });

        const maxNumber = Math.max(...numbers);
        finalReceiverNo = `R-${maxNumber + 1}`;
      } else {
        finalReceiverNo = "R-1000";
      }
    } else {
      // Manual receiverNo: check uniqueness
      const exists = await CustomerDetails.findOne({ receiverNo });
      if (exists) {
        return res.status(400).json({ message: "Receiver No already exists" });
      }
      finalReceiverNo = receiverNo;
    }

    const newCustomer = await CustomerDetails.create({
      receiverNo: finalReceiverNo,
      companyName,
      customerName,
      fabric,
      color,
      dia,
      roll,
      weight,
      partyDcNo,
      date,
      createdBy: req.user?.id,
    });

    return res.status(201).json({
      message: "Customer Details Created Successfully",
      data: newCustomer,
    });

  } catch (error) {
    console.error("Create error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/* ============================================================================
   GET ALL CUSTOMER DETAILS (WITH PAGINATION + SEARCH)
============================================================================ */
export const getAllCustomerDetails = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const query = {
      $or: [
        { companyName: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { receiverNo: { $regex: search, $options: "i" } },
      ],
    };

    const total = await CustomerDetails.countDocuments(search ? query : {});
    const data = await CustomerDetails.find(search ? query : {})
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ date: -1 });

    return res.status(200).json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    console.error("Get all error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/* ============================================================================
   GET CUSTOMER DETAIL BY ID
============================================================================ */
export const getCustomerByReceiver = async (req, res) => {
  try {
    const { receiverNo } = req.params;

    if (!receiverNo || receiverNo.trim() === "") {
      return res
        .status(400)
        .json({ message: "Receiver number is required" });
    }

    // Find customer(s) with this receiver number
    const customer = await CustomerDetails.find({ receiverNo }).sort({
      createdAt: -1,
    });

    if (!customer || customer.length === 0) {
      return res
        .status(404)
        .json({ message: "No customer found for this receiver number" });
    }

    return res.status(200).json({
      success: true,
      count: customer.length,
      data: customer,
    });
  } catch (error) {
    console.error("Error fetching customer by receiverNo:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};






export const updateCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // ✔ Allowed fields for update
    const allowedUpdates = [
      "companyName",
      "customerName",
      "receiverNo",
      "fabric",
      "color",
      "dia",
      "roll",
      "weight",
      "partyDcNo",
      "date"
    ];

    // ✔ Build clean update object
    const updateData = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    // ✔ Auto-update timestamp
    updateData.updatedAt = new Date();

    const updated = await CustomerDetails.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json({
      message: "Customer Details Updated Successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update error:", error);
    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
  }
};

/* ============================================================================
   DELETE CUSTOMER DETAILS BY ID
============================================================================ */
export const deleteCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await CustomerDetails.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json({ message: "Customer Details Deleted Successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};
