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
  roleCheck(["operator","owner", "admin"]),
  startWaterProcess
);
// Pause Water Process → Operator, Staff, Admin
router.post(
  "/pause/:id",
  protect,
  roleCheck(["operator","owner","admin"]),
  pauseWaterProcess
);
// Stop Water Process → Operator, Staff, Admin
router.post(
  "/stop/:id",
  protect,
  roleCheck(["operator","owner","admin"]),
  stopWaterProcess
);
// Calculate Water Cost → Admin, Owner only
router.post(
  "/calc-cost",
  protect,
  roleCheck(["admin", "owner","operator"]),
  calculateWaterCost
);
export default router;
