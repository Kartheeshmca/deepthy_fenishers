import express from "express";
import {
  createBill,
  getAllBills,
  getBillById,
  updateBill,
  deleteBill,
  addDownloadHistory,

} from "../Controllers/Billing.js";
import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

// Only admins or owners can create, update, or delete bills
router.post("/create", protect, roleCheck(["owner", "admin","user"]), createBill);
router.put("/update/:id", protect, roleCheck(["owner", "admin","user"]), updateBill);
router.delete("/delete/:id", protect, roleCheck(["owner", "admin","user"]), deleteBill);

// All logged-in users can view bills
router.get("/all", protect, getAllBills);
router.get("/byId/:id", protect, getBillById);
router.post("/record-download", protect, addDownloadHistory);

export default router;
