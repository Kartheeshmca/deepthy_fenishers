// index.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import userRoutes from "./Routes/User.js  ";
import fabricRoutes from "./Routes/Fabric.js";

import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const App = express();

// ===== Middleware =====
App.use(express.json());
App.use(cors());
App.use(bodyParser.json());
App.use(bodyParser.urlencoded({ extended: true }));

// Serve public folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
App.use(express.static(path.join(__dirname, "public")));

// ===== MongoDB Connection =====
mongoose.set("strictQuery", false);
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/deepthyserver")
  .then(async () => {
    console.log("Connected to MongoDB...");
  })
  .catch((err) => console.error("MongoDB connection error: " + err.message));

// ===== Routes =====
App.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
App.use("/api/users", userRoutes);
App.use("/api/fabric", fabricRoutes);

// ===== Start Server =====
const port = process.env.PORT || 7390;
App.listen(port, () => console.log("Server running on port " + port));
