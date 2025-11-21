import express from "express";
import {
  startWaterProcess,
  pauseWaterProcess,
  stopWaterProcess,
  calculateWaterCost
} from "../Controllers/Water.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

/* -------------------------------------------------------------
   WATER PROCESS ROUTES
--------------------------------------------------------------*/

// Start Water Process → Operator, Staff, Admin
router.post(
  "/start",
  protect,
  roleCheck(["user","owner", "admin"]),
  startWaterProcess
);

// Pause Water Process → Operator, Staff, Admin
router.post(
  "/pause",
  protect,
  roleCheck(["user","owner","admin"]),
  pauseWaterProcess
);

// Stop Water Process → Operator, Staff, Admin
router.post(
  "/stop",
  protect,
  roleCheck(["user","owner","admin"]),
  stopWaterProcess
);

// Calculate Water Cost → Admin, Owner only
router.post(
  "/calc-cost",
  protect,
  roleCheck(["admin", "owner","user"]),
  calculateWaterCost
);

export default router;
