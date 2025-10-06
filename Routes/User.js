// Routes/userRoutes.js
import express from "express";
import {
  createOwnerIfNone,
  createUser,
  login,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  searchAll,
  viewUserPassword
} from "../Controllers/User.js";
import { protect, roleCheck } from "../Middleware/Auth.js";

const router = express.Router();

// Public: create owner only if none exists
router.post("/create-owner", createOwnerIfNone);

// Public: login (req body: { name, password })
router.post("/login", login);

// Protected routes
// Owner and admin can list users
router.get("/all", protect, roleCheck(["owner", "admin"]), getAllUsers);

// Owner and admin create user (but controller enforces that admin can only create user)
router.post("/create", protect, roleCheck(["owner", "admin"]), createUser);

// Get user by id
router.get("/byId/:id", protect, roleCheck(["owner", "admin"]), getUserById);

// Update user (owner/admin/user with rules enforced inside controller)
router.put("/update/:id", protect, updateUser);

// Delete user (owner/admin/user with rules enforced inside controller)
router.delete("/delete/:id", protect, deleteUser);

// Search & paginate users (only owner & admin can access)
router.get("/searchAll", protect, roleCheck(["owner", "admin"]), searchAll);

// Admin/owner view password
router.get("/view-password/:id", protect, roleCheck(["owner", "admin"]), viewUserPassword);
export default router;
