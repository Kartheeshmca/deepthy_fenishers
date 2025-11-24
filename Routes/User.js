import express from "express";
import {
  createOwner,
  createUser,
  login,
  logout,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  viewUserPassword
} from "../Controllers/User.js";

import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

// ==================== AUTH ROUTES ====================

// Login route (no auth required)
router.post("/login", login);

// Logout route (auth required)
router.post("/logout", protect, logout);

// ==================== USER CRUD ROUTES ====================

// Create user (owner/admin/shiftincharge)
router.post("/create-owner", createOwner);
router.post("/create", protect, roleCheck(["owner", "admin", "shiftincharge"]), createUser);

// Get all users (owner/admin/shiftincharge/operator)
router.get("/all", protect, getAllUsers);

// Get user by ID
router.get("/byId/:id", protect, getUserById);

// Update user by ID
router.put("/update/:id", protect, updateUser);

// Delete user by ID
router.delete("/delete/:id", protect, deleteUser);

// View user password (only owner/admin)
router.get("/view-password/:id", protect, roleCheck(["owner", "admin"]), viewUserPassword);

export default router;
