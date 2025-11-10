import express from "express";
import {
  createFabricProcess,
  startFabricProcess,
  endFabricProcess,
  getAllFabricProcesses,
  getFabricProcessByDcNo,
  updateFabricProcess,
  deleteFabricProcess,
  searchFabricProcesses,
  getFabricProcessesPaginated,
  exportFabricProcessesCSV,
} from "../Controllers/Fabric.js";
import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

/* ================================
   🔹 FABRIC PROCESS CREATION & FLOW
   ================================ */
router.post("/create", protect, roleCheck(["owner", "admin", "user"]), createFabricProcess);
router.post("/start", protect, roleCheck(["owner", "admin", "user"]), startFabricProcess);
router.post("/end", protect, roleCheck(["owner", "admin", "user"]), endFabricProcess);

/* ================================
   🔹 FETCHING & REPORTING
   ================================ */
router.get("/all", protect, roleCheck(["owner", "admin", "user"]), getAllFabricProcesses);
router.get("/search", protect, roleCheck(["owner", "admin", "user"]), searchFabricProcesses);
router.get("/paginated", protect, roleCheck(["owner", "admin", "user"]), getFabricProcessesPaginated);
router.get("/export/csv", protect, roleCheck(["owner", "admin"]), exportFabricProcessesCSV);

/* ================================
   🔹 SINGLE PROCESS OPERATIONS
   ================================ */
router.get("/:dcNo", protect, roleCheck(["owner", "admin", "user"]), getFabricProcessByDcNo);
router.put("/update/:dcNo", protect, roleCheck(["owner", "admin"]), updateFabricProcess);
router.delete("/delete/:dcNo", protect, roleCheck(["owner", "admin"]), deleteFabricProcess);

export default router;
