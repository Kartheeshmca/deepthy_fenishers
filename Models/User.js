import mongoose from "mongoose";
import crypto from "crypto";

const algorithm = "aes-256-cbc";
const secretKey = process.env.PASSWORD_SECRET || "0123456789abcdef0123456789abcdef";
const key = Buffer.from(secretKey, "utf8");

// Encrypt password
const encryptPassword = (password) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

// Decrypt password
const decryptPassword = (encrypted) => {
  const [ivHex, encryptedText] = encrypted.split(":");
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, "hex"));
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

const capitalizeName = (name) => {
  if (!name) return name;
  return name
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const metaSchema = new mongoose.Schema({
  lastLogin: Date,
  lastLogout: Date,
  updatedBy: String,
  updatedAt: Date,
  deviceInfo: String
}, { _id: false });

// ⭐ NEW: assignedFabrics schema
const assignedFabricSchema = new mongoose.Schema({
  fabricProcess: { type: mongoose.Schema.Types.ObjectId, ref: "listProcess" },
  receiverNo: String,
  status: { type: String, enum: ["Pending", "Completed","Stopped","Reprocess"], default: "Pending" },
  assignedDate: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true, set: capitalizeName },
  phone: { type: String, match: [/^\d{10}$/] },
  password: { type: String, required: true },
  role: { type: String, enum: ["owner", "admin", "shiftincharge", "operator"], default: "operator" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },

  // ⭐ IMPORTANT FIELD
  assignedFabrics: { type: [assignedFabricSchema], default: [] },

  meta: { type: metaSchema, default: {} }
}, { timestamps: true });

userSchema.pre("save", function(next) {
  if (this.isModified("password") && this.password) {
    this.password = encryptPassword(this.password);
  }
  next();
});

userSchema.methods.comparePassword = function(candidate) {
  try {
    return candidate === decryptPassword(this.password);
  } catch {
    return false;
  }
};

userSchema.methods.getDecryptedPassword = function() {
  return decryptPassword(this.password);
};

export default mongoose.model("User", userSchema);
