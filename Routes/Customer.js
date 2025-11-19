import express from "express";
import {
  createCustomerDetails,
  getAllCustomerDetails,
  getCustomerByReceiver,
  updateCustomerDetails,
  deleteCustomerDetails
} from "../Controllers/Customer.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

/* ============================================================
   CUSTOMER DETAILS ROUTES
============================================================ */

// Create Customer (Admin or Owner)
router.post(
  "/",
  protect,
  roleCheck(["admin", "owner"]),
  createCustomerDetails
);

// Get All Customers
router.get("/", getAllCustomerDetails);

// ✅ Get Customers by Receiver No
router.get("/receiver/:receiverNo", getCustomerByReceiver);

// Update Customer (Admin or Owner)
router.put(
  "/:id",
  // protect,
  // roleCheck(["admin", "owner"]),
  updateCustomerDetails
);

// Delete Customer (Admin or Owner)
router.delete(
  "/:id",
  // protect,
  // roleCheck(["admin", "owner"]),
  deleteCustomerDetails
);

export default router;
