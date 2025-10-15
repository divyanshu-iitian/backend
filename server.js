/* NDMA Storage Backend
   Supports: Images, CSV, and any file type
   
   Routes:
   - POST   /upload          -> Upload file (images, csv, etc)
   - GET    /files           -> List all files
   - GET    /files/:id       -> Get file metadata + URL
   - DELETE /files/:id       -> Delete file
   - POST   /upload-profile  -> Upload profile picture (specific route)
   - GET    /profile/:userId -> Get user's profile picture
*/

import express from "express";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import cors from "cors";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---- Config from env ----
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const BUCKET_NAME = process.env.BUCKET_NAME || "myimagesndma";
const PUBLIC_BUCKET = (process.env.PUBLIC_BUCKET || "true").toLowerCase() === "true";
const SIGNED_URL_EXP_MIN = parseInt(process.env.SIGNED_URL_EXPIRATION_MIN || "60", 10);

// ---- Prepare Google credentials ----
const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account-key.json";

// Temporarily skip GCS check for auth testing
if (!fs.existsSync(keyFilePath)) {
  console.warn(`⚠️  Service account key not found at: ${keyFilePath}`);
  console.warn("GCS file upload won't work, but auth endpoints will!");
  // process.exit(1); // Commented out for auth testing
} else {
  console.log(`✅ Using service account key: ${keyFilePath}`);
}

// console.log(`✅ Using service account key: ${keyFilePath}`);

// ---- Init GCS ----
const storage = new Storage({
  keyFilename: keyFilePath,
});
const bucket = storage.bucket(BUCKET_NAME);

// ---- Multer for memory upload (20MB limit for CSV and images) ----
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 20 * 1024 * 1024 } 
});

// ---- Mongoose schemas ----

// File Schema (for all file types)
const fileSchema = new mongoose.Schema({
  originalName: String,
  gcsName: { type: String, unique: true },
  mimeType: String,
  fileType: String, // 'image', 'csv', 'pdf', 'other'
  size: Number,
  bucket: String,
  publicUrl: String,
  owner: String, // optional user id
  folder: String, // organize files in folders
  createdAt: { type: Date, default: Date.now }
});
const File = mongoose.model("File", fileSchema);

// Profile Picture Schema (separate for easy access)
const profilePicSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
  publicUrl: String,
  updatedAt: { type: Date, default: Date.now }
});
const ProfilePic = mongoose.model("ProfilePic", profilePicSchema);

// User Schema (for authentication)
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

// ---- Connect to MongoDB ----
async function connectDB() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in .env file!");
    console.error("Please add your MongoDB connection string");
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI, { dbName: "ndma_storage_app" });
  console.log("✅ Connected to MongoDB");
}

connectDB().catch(err => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

// ---- Helpers ----
function randomName(originalName) {
  const ext = path.extname(originalName) || "";
  const id = crypto.randomBytes(12).toString("hex");
  return `${Date.now()}-${id}${ext}`;
}

function getFileType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'text/csv' || mimeType === 'application/csv') return 'csv';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'other';
}

async function makePublic(gcsFile) {
  await gcsFile.makePublic();
}

async function getSignedUrl(gcsFile, minutes = SIGNED_URL_EXP_MIN) {
  const [url] = await gcsFile.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + minutes * 60 * 1000
  });
  return url;
}

// ---- Routes ----

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "running", 
    service: "NDMA Storage Backend",
    bucket: BUCKET_NAME,
    publicBucket: PUBLIC_BUCKET
  });
});

// ---- Authentication Routes ----

// Register new user
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Please provide name, email and password" 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: "This email is already registered" 
      });
    }

    // Create new user
    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password, // In production, use bcrypt to hash password
      role: role || 'trainer',
      organization: 'NDMA Training Institute',
      phone: '',
    });

    await newUser.save();

    // Return user without password
    const userResponse = {
      id: newUser._id.toString(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      organization: newUser.organization,
      phone: newUser.phone,
      createdAt: newUser.createdAt,
    };

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

// Login user
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Please provide email and password" 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: "User not found. Please register first." 
      });
    }

    // Check password (in production, use bcrypt.compare)
    if (user.password !== password) {
      return res.status(401).json({ 
        success: false, 
        error: "Incorrect password. Try again." 
      });
    }

    // Return user without password
    const userResponse = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      phone: user.phone,
      createdAt: user.createdAt,
    };

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

// Get user profile
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

// Upload any file (images, CSV, PDF, etc)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded under 'file' field" });
    }

    const owner = req.body.owner || null;
    const folder = req.body.folder || 'general';
    const originalName = req.file.originalname;
    const gcsName = `${folder}/${randomName(originalName)}`;

    const file = bucket.file(gcsName);

    const stream = file.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
      metadata: {
        contentType: req.file.mimetype
      }
    });

    stream.on("error", (err) => {
      console.error("❌ Upload stream error:", err);
      return res.status(500).json({ error: "Upload to GCS failed", details: err.message });
    });

    stream.on("finish", async () => {
      try {
        let publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsName}`;
        
        if (PUBLIC_BUCKET) {
          await makePublic(file);
        } else {
          publicUrl = null;
        }

        const fileType = getFileType(req.file.mimetype);

        // Save metadata to MongoDB
        const fileDoc = await File.create({
          originalName,
          gcsName,
          mimeType: req.file.mimetype,
          fileType,
          size: req.file.size,
          bucket: BUCKET_NAME,
          publicUrl,
          owner,
          folder
        });

        console.log(`✅ Uploaded: ${originalName} (${fileType})`);
        return res.status(201).json({ 
          success: true,
          id: fileDoc._id, 
          originalName, 
          gcsName, 
          publicUrl,
          fileType,
          size: req.file.size
        });
      } catch (err) {
        console.error("❌ Error saving metadata:", err);
        return res.status(500).json({ error: "Saving metadata failed", details: err.message });
      }
    });

    stream.end(req.file.buffer);
  } catch (err) {
    console.error("❌ Upload route error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Upload profile picture (specific route)
app.post("/upload-profile", upload.single("profilePic"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded under 'profilePic' field" });
    }

    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Check if it's an image
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: "Only image files are allowed for profile pictures" });
    }

    const originalName = req.file.originalname;
    const gcsName = `profiles/${userId}/${randomName(originalName)}`;

    const file = bucket.file(gcsName);

    const stream = file.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
      metadata: {
        contentType: req.file.mimetype
      }
    });

    stream.on("error", (err) => {
      console.error("❌ Profile pic upload error:", err);
      return res.status(500).json({ error: "Upload failed", details: err.message });
    });

    stream.on("finish", async () => {
      try {
        let publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsName}`;
        
        if (PUBLIC_BUCKET) {
          await makePublic(file);
        } else {
          publicUrl = await getSignedUrl(file, 10080); // 7 days for profile pics
        }

        // Save file metadata
        const fileDoc = await File.create({
          originalName,
          gcsName,
          mimeType: req.file.mimetype,
          fileType: 'image',
          size: req.file.size,
          bucket: BUCKET_NAME,
          publicUrl,
          owner: userId,
          folder: 'profiles'
        });

        // Update or create profile pic record
        await ProfilePic.findOneAndUpdate(
          { userId },
          { 
            fileId: fileDoc._id,
            publicUrl,
            updatedAt: new Date()
          },
          { upsert: true }
        );

        console.log(`✅ Profile pic uploaded for user: ${userId}`);
        return res.status(201).json({ 
          success: true,
          userId,
          publicUrl,
          fileId: fileDoc._id
        });
      } catch (err) {
        console.error("❌ Error saving profile pic:", err);
        return res.status(500).json({ error: "Saving failed", details: err.message });
      }
    });

    stream.end(req.file.buffer);
  } catch (err) {
    console.error("❌ Profile upload route error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Get user's profile picture
app.get("/profile/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const profile = await ProfilePic.findOne({ userId }).populate('fileId').lean();
    
    if (!profile) {
      return res.status(404).json({ error: "Profile picture not found" });
    }

    let accessUrl = profile.publicUrl;
    
    if (!PUBLIC_BUCKET && profile.fileId) {
      const file = bucket.file(profile.fileId.gcsName);
      accessUrl = await getSignedUrl(file, 10080); // 7 days
    }

    res.json({ 
      userId,
      publicUrl: accessUrl,
      updatedAt: profile.updatedAt
    });
  } catch (err) {
    console.error("❌ Get profile error:", err);
    res.status(500).json({ error: "Failed to get profile picture", details: err.message });
  }
});

// List files (with filters)
app.get("/files", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const skip = parseInt(req.query.skip || "0", 10);
    const owner = req.query.owner;
    const fileType = req.query.fileType; // 'image', 'csv', 'pdf', 'other'
    const folder = req.query.folder;
    
    const filter = {};
    if (owner) filter.owner = owner;
    if (fileType) filter.fileType = fileType;
    if (folder) filter.folder = folder;
    
    const files = await File.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json({ 
      count: files.length,
      files 
    });
  } catch (err) {
    console.error("❌ List files error:", err);
    res.status(500).json({ error: "Failed to list files", details: err.message });
  }
});

// Get single file metadata + URL
app.get("/files/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const fileDoc = await File.findById(id).lean();
    
    if (!fileDoc) {
      return res.status(404).json({ error: "File not found" });
    }

    let accessUrl = fileDoc.publicUrl || null;
    
    if (!accessUrl) {
      const file = bucket.file(fileDoc.gcsName);
      accessUrl = await getSignedUrl(file);
    }

    res.json({ ...fileDoc, accessUrl });
  } catch (err) {
    console.error("❌ Get file error:", err);
    res.status(500).json({ error: "Failed to get file", details: err.message });
  }
});

// Delete file
app.delete("/files/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const fileDoc = await File.findById(id);
    
    if (!fileDoc) {
      return res.status(404).json({ error: "File not found" });
    }

    // Delete from GCS
    const file = bucket.file(fileDoc.gcsName);
    await file.delete().catch(e => {
      if (e.code && e.code !== 404) throw e;
    });

    // Delete from MongoDB
    await File.findByIdAndDelete(id);
    
    console.log(`✅ Deleted: ${fileDoc.originalName}`);
    res.json({ success: true, message: "File deleted successfully" });
  } catch (err) {
    console.error("❌ Delete file error:", err);
    res.status(500).json({ error: "Failed to delete file", details: err.message });
  }
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`\n🚀 NDMA Storage Backend running on port ${PORT}`);
  console.log(`📦 Bucket: ${BUCKET_NAME}`);
  console.log(`🌐 Public: ${PUBLIC_BUCKET}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST   http://localhost:${PORT}/upload`);
  console.log(`  POST   http://localhost:${PORT}/upload-profile`);
  console.log(`  GET    http://localhost:${PORT}/files`);
  console.log(`  GET    http://localhost:${PORT}/files/:id`);
  console.log(`  GET    http://localhost:${PORT}/profile/:userId`);
  console.log(`  DELETE http://localhost:${PORT}/files/:id`);
  console.log(`\n✅ Ready to accept uploads!\n`);
});
