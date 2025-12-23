import User from "../Models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import listProcess from "../Models/list.js";
import { UAParser } from "ua-parser-js";
dotenv.config();

// ==================== HELPER FUNCTIONS ====================

// Generate auto password (first 3 letters of name + last 4 digits of phone)
const generateAutoPassword = (name, phone) => {
  const namePart = (name || "").replace(/\s+/g, "").toLowerCase().substring(0, 3);
  const phonePart = (phone || "").slice(-4);
  return namePart + phonePart;
};
const toIST = (date) => {
  return new Date(date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
};
// ==================== USER CONTROLLERS ====================

// CREATE USER
// CREATE OWNER (No Token Required, multiple allowed, prevent duplicate name+phone)
export const createOwner = async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone) 
      return res.status(400).json({ message: "Name and phone are required" });

    // Check if owner with same name and phone already exists
    const existingOwner = await User.findOne({ role: "owner", name, phone });
    if (existingOwner) 
      return res.status(400).json({ message: "Owner with same name and phone already exists" });

    const pwd = password || generateAutoPassword(name, phone);
    const owner = new User({ name, phone, password: pwd, role: "owner", status: "active"
});

    // Log creation activity

    await owner.save();

    return res.status(201).json({
      message: "Owner created successfully",
      owner: { id: owner._id, name: owner.name, phone: owner.phone, role: owner.role },
      password: password ? undefined : pwd, // return generated password
    });

  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Phone already exists" });
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const createUser = async (req, res) => {
  try {

    const { name, phone, password, role } = req.body;
    const requesterRole = req.user.role;
    // Validation
    if (!role) return res.status(400).json({ message: "Role is required" });
    if (!["owner", "admin", "shiftincharge", "operator"].includes(role))
      return res.status(400).json({ message: "Invalid role" });

    // Role-based creation permissions
    if (requesterRole === "admin" && role === "owner")
      return res.status(403).json({ message: "Admin cannot create owner" });
    if (requesterRole === "shiftincharge" && role !== "operator")
      return res.status(403).json({ message: "ShiftIncharge can only create operators" });
    if (requesterRole === "operator")
      return res.status(403).json({ message: "Operator cannot create users" });

    const pwd = password || generateAutoPassword(name, phone);
const user = new User({
  name,
  phone,
  password: pwd,
  role,
  status: "active",   // ✅ default active
});

    // Log creation activity
    

    await user.save();

    return res.status(201).json({
      message: "User created successfully",
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role, meta: user.meta },
      password: password ? undefined : pwd, // send auto password if generated
    });

  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Phone already exists" });
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// LOGIN
// LOGIN


// LOGIN
export const login = async (req, res) => {
  try {
    const { identifier, password, deviceInfo: frontendDeviceInfo } = req.body;

    if (!identifier || !password)
      return res.status(400).json({ message: "Phone/Name and password required" });

    const user = await User.findOne({
      $or: [
        { phone: identifier.trim() },
        { name: { $regex: new RegExp("^" + identifier.trim() + "$", "i") } },
      ],
    });
      // 🔥 BLOCK INACTIVE USERS
    

    if (!user || !user.comparePassword(password))
      return res.status(401).json({ message: "Invalid credentials" });
if (user.status === "inactive") {
      return res.status(403).json({
        message: "Account is inactive. Please contact admin."
      });
    }
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET || "tempSecret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    // If frontend sends deviceInfo, use it; otherwise parse from user-agent
    let deviceInfo = frontendDeviceInfo;
    if (!deviceInfo) {
      const parser = new UAParser(req.headers["user-agent"]);
      const uaResult = parser.getResult();
      deviceInfo = `${uaResult.device.vendor || "Unknown Device"} ${uaResult.device.model || ""} (${uaResult.device.type || "desktop"}) - OS: ${uaResult.os.name || "Unknown OS"} ${uaResult.os.version || ""} - Browser: ${uaResult.browser.name || "Unknown Browser"} ${uaResult.browser.version || ""}`;
    }

    // Update meta, activity & status
    const now = new Date();
    user.meta.lastLogin = now;
    user.meta.deviceInfo = deviceInfo;
    user.status = "active";  // 🔥 Set ACTIVE on login

    await user.save();

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: user.status,    // 🔥 send status
        meta: {
          ...user.meta.toObject(),
          lastLogin: toIST(now),
        },
      },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// LOGOUT
export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const deviceInfo = req.body.deviceInfo || "Unknown Device";
    const now = new Date();

    // Update status and meta
    user.meta.lastLogout = now;
    user.status = "inactive";   // 🔥 Set INACTIVE on logout

    

    await user.save();

    return res.json({
      message: "Logout successful",
      whoLoggedOut: {
        id: user._id,
        name: user.name,
        role: user.role,
        status: user.status,  // 🔥 send updated status
      },
      lastLogout: toIST(now),
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET ALL USERS (frontend-controlled pagination & latest first)
// ==================== GET ALL USERS ====================

export const getAllUsers = async (req, res) => {
  try {
    const requester = req.user; 

    let filter = {};

    // ======================= ROLE RESTRICTIONS =========================

    if (requester.role === "owner") {
      filter = {};
    } 
    else if (requester.role === "admin") {
      filter = {
        $or: [
          { _id: requester.id },
          { role: "shiftincharge" },
          { role: "operator" }
        ]
      };
    }
    else if (requester.role === "shiftincharge") {
      filter = {
        $or: [
          { _id: requester.id },
          { role: "operator" }
        ]
      };
    }
    else if (requester.role === "operator") {
      filter = { _id: requester.id };
    }

    // ======================= FETCH USERS (NO PAGINATION) =========================

    const users = await User.find(filter).sort({ createdAt: -1 });

    // ======================= FETCH WORK DONE FOR EACH OPERATOR =========================

    const workMap = {};

    const allProcesses = await listProcess.find({}); 

    allProcesses.forEach((p) => {
      if (Array.isArray(p.operator)) {
        p.operator.forEach((op) => {
          if (!workMap[op]) workMap[op] = [];
          workMap[op].push({
            id: p._id,
            machineNo: p.machineNo,
            receiverNo: p.receiverNo,
            qty: p.qty,
            runningTime: p.runningTime,
            orderNo: p.orderNo,
            date: p.date,
            status: p.status
          });
        });
      }
    });

    // ======================= FORMAT USER =========================

    const toIST = (utcDate) => {
      if (!utcDate) return null;
      return new Date(utcDate).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      });
    };

    const formatUser = (u) => ({
      id: u._id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      status: u.status || "inactive",

      // 👇 NEW — Operator work history from listProcess
      workDone: workMap[u.name] || [],

      meta: {
        lastLogin: u.meta?.lastLogin ? toIST(u.meta.lastLogin) : null,
        lastLogout: u.meta?.lastLogout ? toIST(u.meta.lastLogout) : null,
        deviceInfo: u.meta?.deviceInfo || "Unknown Device",
      }
    });

    return res.status(200).json({
      success: true,
      total: users.length,
      users: users.map(formatUser),
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Convert UTC → IST
    const toIST = (utcDate) => {
      if (!utcDate) return null;
      return new Date(utcDate).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      });
    };

    // ===================== FETCH WORK DONE =====================  
    // If user role is operator or admin → fetch work
    let workDone = [];
    if (["operator", "admin"].includes(user.role)) {
      workDone = await listProcess.find({ operator: user.name }) // operators stored as string array
        .sort({ createdAt: -1 })
        .select("machineNo receiverNo qty runningTime orderNo date status");
    }

    // Convert date → IST for each work item
    const formattedWork = workDone.map((w) => ({
      id: w._id,
      machineNo: w.machineNo,
      receiverNo: w.receiverNo,
      qty: w.qty,
      runningTime: w.runningTime,
      orderNo: w.orderNo,
      date: toIST(w.date),
      status: w.status,
    }));

    // ===================== FORMAT USER =====================  
    const formattedUser = {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status || "inactive",
      workDone: formattedWork,
      meta: {
        lastLogin: user.meta?.lastLogin ? toIST(user.meta.lastLogin) : null,
        lastLogout: user.meta?.lastLogout ? toIST(user.meta.lastLogout) : null,
        deviceInfo: user.meta?.deviceInfo || "Unknown Device",
      }
    };

    return res.status(200).json({
      success: true,
      user: formattedUser,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE USER
export const updateUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });

    const requester = req.user;
    const deviceInfo = req.body.deviceInfo || "Unknown Device";

    // Role restrictions
    if (requester.role === "admin" && target.role === "owner")
      return res.status(403).json({ message: "Admin cannot update owner" });

    if (requester.role === "shiftincharge" && ["owner", "admin"].includes(target.role))
      return res.status(403).json({ message: "ShiftIncharge cannot update owner/admin" });

    if (requester.role === "operator" && requester.id !== target._id.toString())
      return res.status(403).json({ message: "Operator can update only self" });

    const { name, phone, password, role,status } = req.body;
    const changes = [];

    if (name && name !== target.name) { changes.push(`name updated`); target.name = name; }
    if (phone && phone !== target.phone) { changes.push(`phone updated`); target.phone = phone; }
    if (password) { changes.push("password updated"); target.password = password; }
  if (status && status !== target.status) {
      target.status = status;
      changes.push("status");
    }

    if (role && role !== target.role) {
      if (requester.role !== "owner") 
        return res.status(403).json({ message: "Only owner can change role" });
      
      changes.push(`role updated`);
      target.role = role;
    }

    if (changes.length > 0) {
      target.meta.updatedBy = requester.name;
      target.meta.updatedAt = new Date();
    }

    await target.save();

    return res.json({
      message: "User updated",
      user: {
        id: target._id,
        name: target.name,
        phone: target.phone,
        role: target.role,
        status: target.status,
        assignedFabrics: target.assignedFabrics,
        meta: {
          lastLogin: target.meta.lastLogin ? toIST(target.meta.lastLogin) : null,
          lastLogout: target.meta.lastLogout ? toIST(target.meta.lastLogout) : null,
          updatedBy: target.meta.updatedBy || null,
          updatedAt: target.meta.updatedAt ? toIST(target.meta.updatedAt) : null,
          deviceInfo: target.meta.deviceInfo || "Unknown Device",
        }
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};


// DELETE USER
export const deleteUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });

    const requester = req.user;

    if (requester.role === "admin" && target.role === "owner")
      return res.status(403).json({ message: "Admin cannot delete owner" });
    if (requester.role === "shiftincharge" && ["owner", "admin"].includes(target.role))
      return res.status(403).json({ message: "ShiftIncharge cannot delete owner/admin" });
    if (requester.role === "operator" && requester.id !== target._id.toString())
      return res.status(403).json({ message: "Operator can delete only self" });

    const now = new Date();

    // 🔥 Add delete activity BEFORE deleting
    
    await target.save();
    await User.findByIdAndDelete(req.params.id);

    return res.json({
      message: "User deleted successfully",
      deletedAt: toIST(now)
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// VIEW USER PASSWORD (owner/admin only)
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
      password: user.getDecryptedPassword(), // decrypt from schema
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
