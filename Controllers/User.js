// Controllers/userController.js
import User from "../Models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

/**
 * Helper to generate auto password: first 3 letters of name (lowercased) + last 4 digits of phone
 * If name shorter than 3, use full name.
*/
const generateAutoPassword = (name, phone) => {
  const namePart = (name || "").replace(/\s+/g, "").toLowerCase().substring(0, 3);
  const phonePart = (phone || "").slice(-4);
  return namePart + phonePart;
};

export const createOwnerIfNone = async (req, res) => {
  try {
    // const existingOwner = await User.findOne({ role: "owner" });
    // if (existingOwner) return res.status(400).json({ message: "Owner already exists" });

    const { name, phone, password } = req.body;
    if (!name || !phone) return res.status(400).json({ message: "Name and phone required" });

    const pwd = password ? password : generateAutoPassword(name, phone);
    const owner = new User({ name, phone, password: pwd, role: "owner" });
    await owner.save();

    return res.status(201).json({
      message: "Owner created",
      owner: { id: owner._id, name: owner.name, phone: owner.phone, role: owner.role },
      password: password ? undefined : pwd, // return generated password once
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Phone already exists" });
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// General user creation
export const createUser = async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;
    const requesterRole = req.user.role;

    if (!role) return res.status(400).json({ message: "Role is required (admin/user)" });
    if (!["admin", "user"].includes(role)) return res.status(400).json({ message: "Invalid role" });

    if (requesterRole === "admin" && role !== "user") {
      return res.status(403).json({ message: "Admin can only create users" });
    }

    const pwd = password ? password : generateAutoPassword(name, phone);
    const user = new User({ name, phone, password: pwd, role });
    await user.save();

    return res.status(201).json({
      message: "User created",
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role },
      password: password ? undefined : pwd,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Phone already exists" });
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Login
// Login (requires name, phone, and password)


export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = phone OR name

    if (!identifier || !password) {
      return res.status(400).json({ message: "Phone/Name and password are required" });
    }

    // Find user by phone OR name
    // 
    // const user = await User.findOne({
      // $or: [
        // { phone: identifier },
        // { name: new RegExp("^" + identifier + "$", "i") }, // case-insensitive exact match
      // ],
    // });
    const identifierTrimmed = identifier.trim();

const user = await User.findOne({
  $or: [
    { phone: identifierTrimmed },
    { name: { $regex: new RegExp("^" + identifierTrimmed + "$", "i") } },
  ],
});


    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET || "temporarySecret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};




// Get all users (owner/admin protected)
export const getAllUsers = async (req, res) => {
  try {
    const requesterRole = req.user.role;

    // Fetch all users except owner
    let users;
    if (requesterRole === "admin" || requesterRole === "owner") {
      // Admin/owner can see passwords
      users = await User.find({ role: { $ne: "owner" } }).sort({ createdAt: -1 });
    } else {
      // Normal users cannot see passwords
      users = await User.find({ role: { $ne: "owner" } })
        .select("-password")
        .sort({ createdAt: -1 });
    }

    return res.json({ users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};


export const getUserById = async (req, res) => {
  try {
    const requesterRole = req.user.role;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only remove password for normal users
    const responseUser = {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      password: requesterRole === "admin" || requesterRole === "owner" ? user.password : undefined,
    };

    return res.json({ user: responseUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};


export const updateUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const requester = req.user;

    // Only owner can update admin or owner. Admin can update user only. Users can update themselves.
    const toUpdate = await User.findById(targetId);
    if (!toUpdate) return res.status(404).json({ message: "User not found" });

    // Role-based access
    if (requester.role === "admin" && toUpdate.role !== "user") {
      return res.status(403).json({ message: "Admin can update users only" });
    }
    if (requester.role === "user" && requester.id !== toUpdate._id.toString()) {
      return res.status(403).json({ message: "User can update only their own profile" });
    }

    const { name, phone, password } = req.body;
    if (name) toUpdate.name = name;
    if (phone) toUpdate.phone = phone;
    if (password) toUpdate.password = password; // will be hashed in pre-save

    await toUpdate.save();

    return res.json({ message: "User updated", user: { id: toUpdate._id, name: toUpdate.name, phone: toUpdate.phone, role: toUpdate.role } });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Phone already exists" });
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const requester = req.user;
    const toDelete = await User.findById(targetId);
    if (!toDelete) return res.status(404).json({ message: "User not found" });

    // Owner cannot be deleted except by owner (we'll disallow deletion of owner by others)
    if (toDelete.role === "owner" && requester.role !== "owner") {
      return res.status(403).json({ message: "Only owner can delete owner" });
    }

    // Admin cannot delete admin/owner
    if (requester.role === "admin" && toDelete.role !== "user") {
      return res.status(403).json({ message: "Admin can delete users only" });
    }

    // Users can delete themselves
    if (requester.role === "user" && requester.id !== toDelete._id.toString()) {
      return res.status(403).json({ message: "User can delete only their own account" });
    }

    await User.findByIdAndDelete(targetId);
    return res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
// ---------------- Search & Paginate Users ----------------
export const searchAll = async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query; // default page 1, limit 10
    const query = {};

    // Search by name, phone, or role
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { role: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by role specifically
    if (role) {
      query.role = role;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .select("-password")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "No users found",
      });
    }

    res.json({
      success: true,
      data: users,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// View decrypted password (only owner/admin)
export const viewUserPassword = async (req, res) => {
  try {
    const requesterRole = req.user.role;
    if (!["owner", "admin"].includes(requesterRole))
      return res.status(403).json({ message: "Access denied" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      password: user.getDecryptedPassword(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};