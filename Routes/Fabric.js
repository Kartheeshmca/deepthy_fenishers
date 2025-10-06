import express from "express";
import {
  createFabricProcess,
  endFabricProcess,
  getAllFabricProcesses,
  getFabricProcessByDcNo,
  updateFabricProcess,
  deleteFabricProcess
} from "../Controllers/Fabric.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

// ✅ Start a new fabric process
router.post("/start", protect, roleCheck(["owner", "admin"]), createFabricProcess);

// ✅ End a running fabric process
router.post("/end", protect, roleCheck(["owner", "admin"]), endFabricProcess);

// ✅ Get all fabric processes
router.get("/all", protect, roleCheck(["owner", "admin"]), getAllFabricProcesses);

// ✅ Get a fabric process by DC number
router.get("/:dcNo", protect, roleCheck(["owner", "admin"]), getFabricProcessByDcNo);

// ✅ Update a fabric process
router.put("/:dcNo", protect, roleCheck(["owner", "admin"]), updateFabricProcess);

// ✅ Delete a fabric process
router.delete("/:dcNo", protect, roleCheck(["owner", "admin"]), deleteFabricProcess);

export default router;
