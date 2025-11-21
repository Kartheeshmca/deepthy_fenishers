import express from "express";
import {
  createFabricProcess,
  getAllFabricProcesses,
  getFabricProcessById,
  updateFabricProcess,
  deleteFabricProcess,
  getPendingFabricProcesses,
  getOperatorAssignedFabrics,
  getCompletedFabricProcesses,
  reProcessFabricWithWaterCost,
  getFabricReportByMachine,
  getFabricReportByReceiver
} from "../Controllers/list.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

/* ============================================================================
   ADMIN / OPERATOR ROUTES
============================================================================ */

// Create fabric process → Only Admin / Manager
router.post(
  "/create",
   protect,
   roleCheck(["admin","owner"]),
  createFabricProcess
);

// Get all fabrics → Admin / Manager
router.get(
  "/",
   protect,
  roleCheck(["admin","owner"]),
  getAllFabricProcesses
);


/* ============================================================================
   OPERATOR SPECIFIC ROUTES
============================================================================ */

// Get assigned pending fabrics → Operator
router.get(
  "/assigned",
  protect,
  roleCheck(["user"]),
  getOperatorAssignedFabrics
);

// Get pending fabrics for table/filter → Admin / Manager
router.get(
  "/pending",
   protect,
   roleCheck(["admin","owner"]),
  getPendingFabricProcesses
);

// Get completed fabrics → Admin / Manager
router.get(
  "/completed",
   protect,
   roleCheck(["admin","owner"]),
  getCompletedFabricProcesses
);

// Reprocess fabric with water cost → Admin / Manager
router.post(
  "/:receiverNo",
  protect,
  roleCheck(["admin","owner"]),
  reProcessFabricWithWaterCost
);
router.get(
  "/report/machine/:machineNo",
  protect,
  roleCheck(["admin", "owner"]),
  getFabricReportByMachine
);
router.get(
  "/receiver/:receiverNo",
  protect,
  roleCheck(["admin", "owner"]),
  getFabricReportByReceiver
);
// Get single fabric by ID → Admin / Manager
router.get(
  "/:id",
  protect,
   roleCheck(["admin","owner"]),
  getFabricProcessById
);

// Update fabric process → Admin / Manager
router.put(
  "/:id",
   protect,
   roleCheck(["admin","owner"]),
  updateFabricProcess
);

// Delete fabric process → Admin / Manager
router.delete(
  "/:id",
   protect,
   roleCheck(["admin","owner"]),
  deleteFabricProcess
);
export default router;
