// Routes/Fabric.js
import express from "express";
import {
  createProcessWithCustomer,
  getCustomerByReceiverNo,
  getCustomerByReceiverNoExpanded,
  startProcess,
  stopProcess,
  addChemical,
  addDye,
  listProcesses,
  getFabricByUser,
  getLatestFabricPerDC,
  getFabricProcessesPaginated,
  searchFabricProcesses,
  deleteFabricProcess,
  updateFabricProcess,
  createCustomerDetails
} from "../Controllers/list.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

/* -----------------------------
   CUSTOMER
------------------------------*/
// Get latest customer info by receiverNo
router.get("/customer", protect, getCustomerByReceiverNo);
router.get("/customer/expanded", protect, getCustomerByReceiverNoExpanded);

/* -----------------------------
   FABRIC PROCESS CRUD
------------------------------*/
// Create new fabric process (Admin/Owner)
router.post("/", protect, roleCheck(["admin", "owner"]), createProcessWithCustomer);

// Update existing process (Admin/Owner)
router.put("/:dcNo", protect, roleCheck(["admin", "owner"]), updateFabricProcess);

// Delete a process (Admin/Owner)
router.delete("/:dcNo", protect, roleCheck(["admin", "owner"]), deleteFabricProcess);

// List all processes or filter by query
router.get("/", protect, listProcesses);

// Get fabric processes by user
router.get("/user/:userId", protect, getFabricByUser);

// Get latest process per DC
router.get("/latest-per-dc", protect, getLatestFabricPerDC);

// Paginated list
router.get("/paginated", protect, getFabricProcessesPaginated);

// Search processes
router.get("/search", protect, searchFabricProcesses);
router.post("/customer-details", createCustomerDetails);
/* -----------------------------
   WATER PROCESS
------------------------------*/
// Start or resume water process
router.post("/start", protect, roleCheck(["admin", "owner", "operator"]), startProcess);

// Stop or pause water process
router.post("/stop", protect, roleCheck(["admin", "owner", "operator"]), stopProcess);

/* -----------------------------
 CHEMICAL & DYE
------------------------------*/
// Add chemical
router.post("/:dcNo/chemical", protect, roleCheck(["admin", "owner"]), addChemical);

// Add dye
router.post("/:dcNo/dye", protect, roleCheck(["admin", "owner"]), addDye);

export default router;
