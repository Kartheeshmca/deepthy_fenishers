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

// Create Customer (Admin or Owner)
router.post(
  "/create",
   protect,
   roleCheck(["admin", "owner"]),
  createCustomerDetails
);

// Get All Customers
router.get("/",protect,roleCheck(["admin", "owner"]), getAllCustomerDetails);

// ✅ Get Customers by Receiver No
router.get("/receiver/:receiverNo",protect,roleCheck(["admin", "owner"]), getCustomerByReceiver);

// Update Customer (Admin or Owner)
router.put(
  "/update/:id",
   protect,
   roleCheck(["admin", "owner"]),
  updateCustomerDetails
);

// Delete Customer (Admin or Owner)
router.delete(
  "/delete/:id",
   protect,
   roleCheck(["admin", "owner"]),
  deleteCustomerDetails
);

export default router;
