import express from "express";
import {
  createFabricProcess,
  reProcessFabric,
  getAllFabricProcesses,
  getPendingFabricProcesses,
  getOperatorAssignedFabrics
} from "../Controllers/list.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

/* ============================================================================
// CREATE FABRIC PROCESS (ASSIGN WORK)
============================================================================ */
router.post(
  "/create",
  protect,                 // User must be logged in
  roleCheck(["admin", "owner"]), // Only admin/supervisor can create
  createFabricProcess
);

/* ============================================================================
// RE-PROCESS FABRIC
============================================================================ */
router.post(
  "/reprocess/:receiverNo",
  protect,
  roleCheck(["admin", "owner"]),
  reProcessFabric
);

/* ============================================================================
// GET ALL FABRIC PROCESSES
============================================================================ */
router.get(
  "/all",
  protect,
  roleCheck(["admin", "owner"]),
  getAllFabricProcesses
);

/* ============================================================================
// GET PENDING FABRIC PROCESSES (latest per receiver)
============================================================================ */
router.get(
  "/pending",
  protect,
  roleCheck(["admin", "owner","user"]),
  getPendingFabricProcesses
);

/* ============================================================================
// GET OPERATOR ASSIGNED FABRICS
============================================================================ */
router.get(
  "/operator/assigned",
  protect,
  roleCheck(["user"]),
  getOperatorAssignedFabrics
);

export default router;
