import express from "express";
import {
  createFabricProcess,
  getCompletedFabricProcesses,
  reProcessFabricWithWaterCost,
  getPendingFabricProcesses,
  getOperatorAssignedFabrics,
  updateFabricProcess,
  deleteFabricProcess,
  getAllFabricProcesses,
  getFabricProcessById,
  getFabricReportByMachine,
  getFabricReportByReceiver,
  addDyesAndChemicalsByReceiver,
  getFabricsByMachine,
  getAllMachineReports,
  getOperatorDashboard,
  getWaterIdByFabricProcessId
} from "../Controllers/list.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

// =====================================
// FABRIC PROCESS ROUTES
// =====================================

// Create new process
router.post(
  "/create",
  protect,
  roleCheck(["admin", "owner", "shiftincharge"]),
  createFabricProcess
);

// Get all
router.get(
  "/all",
  protect,
  roleCheck(["admin", "owner"]),
  getAllFabricProcesses
);

// Get single
router.get(
  "/single/:id",
  protect,
  roleCheck(["admin", "owner"]),
  getFabricProcessById
);
router.get(
  "/machine",
  protect,
  roleCheck(["admin", "owner","operator","shiftincharge"]),
  getFabricsByMachine
);

// Pending latest per receiver
router.get(
  "/pending/list",
  protect,
  roleCheck(["admin", "owner", "shiftincharge"]),
  getPendingFabricProcesses
);

// Completed
router.get(
  "/completed/list",
  protect,
  roleCheck(["admin", "owner"]),
  getCompletedFabricProcesses
);

// Reprocess
router.put(
  "/reprocess/:id",
  protect,
  roleCheck(["admin", "owner", "shiftincharge"]),
  reProcessFabricWithWaterCost
);

// Operator tasks
router.get(
  "/operator/tasks",
  protect,
  roleCheck(["admin", "owner", "operator"]),
  getOperatorAssignedFabrics
);

// Machine report
router.get(
  "/report/machine/:machineNo",
  protect,
  roleCheck(["admin", "owner"]),
  getFabricReportByMachine
);
router.get(
  "/machinereport",
  protect,
  roleCheck(["admin", "owner"]),
  getAllMachineReports
);

// Receiver report
router.get(
  "/report/receiver/:receiverNo",
  protect,
  roleCheck(["admin", "owner"]),
  getFabricReportByReceiver
);

// Add dyes & chemicals
router.post(
  "/dyes-chemicals/:receiverNo",
  protect,
  roleCheck(["admin", "owner"]),
  addDyesAndChemicalsByReceiver
);
// GET Water ID using listProcess ID
router.get("/process/water/:id", 
  protect,
roleCheck(["admin", "owner"]),
  getWaterIdByFabricProcessId);
router.get(
  "/alloperator",
  protect,
  roleCheck(["admin", "owner"]),
  getOperatorDashboard
);
// Update
router.put(
  "/update/:id",
  protect,
  roleCheck(["admin", "owner"]),
  updateFabricProcess
);

// Delete
router.delete(
  "/delete/:id",
  protect,
  roleCheck(["admin", "owner"]),
  deleteFabricProcess
);

export default router;
