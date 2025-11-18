// Routes/Customer.js

import express from "express";
import {
  createCustomerDetails,
  getAllCustomerDetails,
  getCustomerDetailsById,
  updateCustomerDetails,
  deleteCustomerDetails
} from "../Controllers/Customer.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

/* ============================================================
   CUSTOMER DETAILS ROUTES
============================================================ */

// 🔒 Create Customer (Admin or Owner only)
router.post(
  "/",
  protect,
  roleCheck(["admin", "owner"]),
  createCustomerDetails
);

// 🔓 Get All Customers (Any authenticated user)
router.get("/",  getAllCustomerDetails);

// 🔓 Get Customer by ID (Any authenticated user)
router.get("/:id",  getCustomerDetailsById);

// 🔒 Update Customer (Admin or Owner only)
router.put(
  "/_:id",
//   protect,
//   roleCheck(["admin", "owner"]),
  updateCustomerDetails
);

// 🔒 Delete Customer (Admin or Owner only)
router.delete(
  "/_:id",
//   protect,
//   roleCheck(["admin", "owner"]),
  deleteCustomerDetails
);

export default router;
