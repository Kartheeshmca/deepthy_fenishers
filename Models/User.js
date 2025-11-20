import mongoose from "mongoose";
import crypto from "crypto";

// AES encryption setup
const algorithm = "aes-256-cbc";
const secretKey = process.env.PASSWORD_SECRET || "0123456789abcdef0123456789abcdef"; // 32 chars
const key = Buffer.from(secretKey, "utf8"); // AES-256 requires 32 bytes

const encryptPassword = (password) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

const decryptPassword = (encrypted) => {
  const [ivHex, encryptedText] = encrypted.split(":");
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, "hex"));
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

// Capitalize helper
const capitalizeName = (name) => {
  if (!name) return name;
  return name
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// User schema
const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, set: capitalizeName },
    phone: { type: String, unique: true, match: [/^\d{10}$/, "Phone must be 10 digits"] },
    password: { type: String, required: true },
    role: { type: String, enum: ["owner", "admin", "user"], default: "user" },
     assignedFabrics: [
    {
      fabricProcess: { type: mongoose.Schema.Types.ObjectId, ref: "listProcess" },
      receiverNo: String,
      status: { type: String, default: "Pending" }
    }
  ]
  },
  { timestamps: true }
);

// Encrypt password before saving
userSchema.pre("save", function (next) {
  if (this.isModified("password") && this.password) {
    this.password = encryptPassword(this.password);
  }
  next();
});

// Compare password for login
userSchema.methods.comparePassword = function (candidatePassword) {
  try {
    return candidatePassword === decryptPassword(this.password);
  } catch (err) {
    return false;
  }
};

// Decrypt password for admin/owner
userSchema.methods.getDecryptedPassword = function () {
  return decryptPassword(this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
