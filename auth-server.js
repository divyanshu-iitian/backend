/* Simple Auth-Only Backend Server for MongoDB Testing */

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

dotenv.config();

const app = express();
// Configure CORS to allow Authorization header for token-based auth
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI; // Must be provided via environment
let JWT_SECRET = process.env.JWT_SECRET; // Must be provided via environment in production
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_UNSAFE_FALLBACK = (process.env.ALLOW_UNSAFE_FALLBACK || '').toLowerCase() === 'true';

// ---- User Schema ----
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['trainer', 'authority'], default: 'trainer' },
  organization: { type: String, default: 'NDMA Training Institute' },
  phone: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

import Report from './models/Report.js';

// ---- Health Check ----
app.get("/", (req, res) => {
  res.json({ 
    status: "running", 
    service: "NDMA Auth Backend",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    auth: "jwt-enabled"
  });
});

// ---- Auth Middleware (JWT) ----
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader) {
      return res.status(401).json({ success: false, error: "Authorization header missing" });
    }
    const parts = authHeader.split(" ");
    const token = parts.length === 2 ? parts[1] : null;
    if (!token) {
      return res.status(401).json({ success: false, error: "Token missing" });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };
    return next();
  } catch (err) {
    console.error("JWT auth error:", err.message);
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

// ---- Register ----
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Please provide name, email and password" 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: "This email is already registered" 
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: passwordHash,
      role: role || 'trainer',
      organization: 'NDMA Training Institute',
      phone: '',
    });

    await newUser.save();

    const userResponse = {
      id: newUser._id.toString(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      organization: newUser.organization,
      phone: newUser.phone,
      createdAt: newUser.createdAt,
    };

    console.log(`✅ User registered: ${newUser.email}`);
    // Auto-issue token on register for convenience
    const token = jwt.sign(
      { userId: newUser._id.toString(), email: newUser.email, role: newUser.role, name: newUser.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.status(201).json({ 
      success: true, 
      user: userResponse,
      token,
      message: "Account created successfully" 
    });

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Registration failed. Please try again." 
    });
  }
});

// ---- Login ----
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Please provide email and password" 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: "User not found. Please register first." 
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      return res.status(401).json({ 
        success: false, 
        error: "Incorrect password. Try again." 
      });
    }

    const userResponse = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      phone: user.phone,
      createdAt: user.createdAt,
    };

    console.log(`✅ User logged in: ${user.email}`);
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ 
      success: true, 
      user: userResponse,
      token,
      message: "Login successful" 
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Login failed. Please try again." 
    });
  }
});

// ---- Get User Profile ----
app.get("/api/auth/user/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }

    res.json({ 
      success: true, 
      user 
    });

  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to get user data" 
    });
  }
});

// ========================================
// TRAINING REPORTS ENDPOINTS
// ========================================

// ---- Create Training Report ----
app.post("/api/reports/create", authenticate, async (req, res) => {
  try {
    const { 
      trainingType, location, date, participants, duration,
      description, effectiveness, photos, documents
    } = req.body;

    if (!trainingType || !location || !date) {
      return res.status(400).json({ 
        success: false, 
        error: "Required fields: trainingType, location, date" 
      });
    }

    const newReport = new Report({
      userId: req.user.id,
      userEmail: req.user.email,
      trainingType,
      location,
      date,
      participants,
      duration,
      description,
      effectiveness,
      photos: photos || [],
      documents: documents || [],
    });

    await newReport.save();
    console.log("✅ Training report created:", newReport._id);

    res.status(201).json({ 
      success: true, 
      report: newReport,
      message: "Training report created successfully"
    });

  } catch (error) {
    console.error("Create report error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to create training report" 
    });
  }
});

// ---- Get User Reports ----
// Current user's reports (recommended)
app.get("/api/reports/user", authenticate, async (req, res) => {
  try {
    const reports = await Report.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, reports, count: reports.length });
  } catch (error) {
    console.error("Get reports error:", error);
    res.status(500).json({ success: false, error: "Failed to get reports" });
  }
});

// ---- Get All Reports (for authorities) ----
app.get("/api/reports/all", authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'authority') {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const reports = await Report.find().sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      reports,
      count: reports.length
    });

  } catch (error) {
    console.error("Get all reports error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to get reports" 
    });
  }
});

// ---- Update Training Report ----
app.put("/api/reports/update/:reportId", authenticate, async (req, res) => {
  try {
    const { reportId } = req.params;
    const updateData = req.body;
    
    // Only owner or authority can update
    const existing = await Report.findById(reportId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }
    if (existing.userId.toString() !== req.user.id && req.user.role !== 'authority') {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const report = await Report.findByIdAndUpdate(reportId, updateData, { new: true });

    if (!report) {
      return res.status(404).json({ 
        success: false, 
        error: "Report not found" 
      });
    }

    res.json({ 
      success: true, 
      report,
      message: "Report updated successfully"
    });

  } catch (error) {
    console.error("Update report error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update report" 
    });
  }
});

// ---- Delete Training Report ----
app.delete("/api/reports/delete/:reportId", authenticate, async (req, res) => {
  try {
    const { reportId } = req.params;

    // Only owner or authority can delete
    const existing = await Report.findById(reportId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }
    if (existing.userId.toString() !== req.user.id && req.user.role !== 'authority') {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const report = await Report.findByIdAndDelete(reportId);

    if (!report) {
      return res.status(404).json({ 
        success: false, 
        error: "Report not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Report deleted successfully"
    });

  } catch (error) {
    console.error("Delete report error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete report" 
    });
  }
});

// ---- Connect to MongoDB & Start Server ----
async function start() {
  try {
    if (!MONGODB_URI) {
      console.error("❌ MONGODB_URI not set. Set it as an environment variable.");
      process.exit(1);
    }
    if (!JWT_SECRET) {
      if (IS_PROD && !ALLOW_UNSAFE_FALLBACK) {
        console.error("❌ JWT_SECRET not set. Set it as an environment variable in production.");
        process.exit(1);
      }
      const scope = IS_PROD ? 'PRODUCTION (UNSAFE FALLBACK ENABLED)' : 'dev';
      console.warn(`⚠️ JWT_SECRET not set. Generating ephemeral secret in ${scope}. Tokens will reset on restart.`);
      JWT_SECRET = Math.random().toString(36).slice(2) + Date.now();
      process.env.JWT_SECRET = JWT_SECRET;
    }

    console.log("🔄 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI, { dbName: "ndma_auth_db" });
    console.log("✅ Connected to MongoDB");

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Auth Backend running on:`);
      console.log(`   http://localhost:${PORT}`);
      console.log(`   http://192.168.1.9:${PORT} (network access)`);
      console.log(`\n📋 Auth Endpoints:`);
      console.log(`  POST   http://192.168.1.9:${PORT}/api/auth/register`);
      console.log(`  POST   http://192.168.1.9:${PORT}/api/auth/login`);
      console.log(`  GET    http://192.168.1.9:${PORT}/api/auth/user/:userId`);
      console.log(`\n📋 Report Endpoints (JWT required):`);
      console.log(`  POST   /api/reports/create`);
      console.log(`  GET    /api/reports/user`);
      console.log(`  GET    /api/reports/user/:userId`);
      console.log(`  GET    /api/reports/all (authority only)`);
      console.log(`\n✅ Ready for authentication from network!\n`);
    });

  } catch (error) {
    console.error("❌ Startup error:", error);
    process.exit(1);
  }
}

start();
