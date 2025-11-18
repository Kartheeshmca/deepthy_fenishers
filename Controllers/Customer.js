import CustomerDetails from "../Models/Customer.js";

/* ============================================================================
   CREATE CUSTOMER DETAILS
============================================================================ */
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

    // Required field validation
    if (!companyName || companyName.trim() === "") {
      return res.status(400).json({ message: "Company Name is required" });
    }

    // If you want to check existing customer
    const finduser = await CustomerDetails.findOne({ companyName })
      .populate("createdBy", "_id name phone");

    // Creating new customer
    const newCustomer = await CustomerDetails.create({
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
      createdBy: req.user?.id,   // 🔥 Add logged-in user ID
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
export const getCustomerDetailsById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await CustomerDetails.findById(id);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json(customer);
  } catch (error) {
    console.error("Get by ID error:", error);
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/* ============================================================================
   UPDATE CUSTOMER DETAILS BY ID
============================================================================ */
export const updateCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await CustomerDetails.findByIdAndUpdate(id, req.body, {
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
    return res.status(500).json({ message: "Server Error", error: error.message });
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
