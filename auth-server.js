/* Simple Auth-Only Backend Server for MongoDB Testing */

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://divyanshumishra0208_db_user:1l3BoCM6C74G0NPr@cluster0.jsbvffu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

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

// ---- Health Check ----
app.get("/", (req, res) => {
  res.json({ 
    status: "running", 
    service: "NDMA Auth Backend",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

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

    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password,
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
    res.status(201).json({ 
      success: true, 
      user: userResponse,
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

    if (user.password !== password) {
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
    res.json({ 
      success: true, 
      user: userResponse,
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

// ---- Connect to MongoDB & Start Server ----
async function start() {
  try {
    if (!MONGODB_URI) {
      console.error("❌ MONGODB_URI not set in .env file!");
      process.exit(1);
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
      console.log(`\n✅ Ready for authentication from network!\n`);
    });

  } catch (error) {
    console.error("❌ Startup error:", error);
    process.exit(1);
  }
}

start();
