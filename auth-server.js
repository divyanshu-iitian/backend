/* Simple Auth-Only Backend Server for MongoDB Testing */

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import os from "os";

dotenv.config();

const app = express();
// Configure CORS to allow Authorization header for token-based auth
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const MONGODB_URI = process.env.MONGODB_URI; // Must be provided via environment
let JWT_SECRET = process.env.JWT_SECRET; // Must be provided via environment in production
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_UNSAFE_FALLBACK = (process.env.ALLOW_UNSAFE_FALLBACK || '').toLowerCase() === 'true';

// ---- User Schema ----
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: function() { return this.role !== 'trainee'; }, lowercase: true, sparse: true },
  password: { type: String, required: true }, // Password required for all roles
  role: { type: String, enum: ['trainer', 'authority', 'trainee'], default: 'authority' },
  organization: { 
    type: String, 
    enum: [
      'NDMA',      // National Disaster Management Authority
      'SDMA',      // State Disaster Management Authority
      'DDMA',      // District Disaster Management Authority
      'NGO',       // Non-Governmental Organizations
      'Fire Services', 
      'Police', 
      'Health',
      'Civil Defense',
      'Military',
      'Educational Institute',
      'Corporate',
      'Other'
    ],
    default: 'NDMA' 
  },
  phone: { type: String, required: function() { return this.role === 'trainee'; }, unique: true, sparse: true },
  phone_verified: { type: Boolean, default: false },
  designation: String,
  
  // Trainee-specific fields
  age_bracket: { type: String, enum: ['18-25', '26-35', '36-45', '46-60', '60+'], required: false },
  district: String,
  state: String,
  consent_location: { type: Boolean, default: false },
  consent_attendance: { type: Boolean, default: false },
  profile_photo: String,
  
  // Metadata
  verified: { type: Boolean, default: false },
  last_login: Date,
  device_tokens: [String], // For push notifications
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for fast phone lookup (trainee login)
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });

const User = mongoose.model("User", userSchema);

import Report from './models/Report.js';
import AttendanceSession from './models/AttendanceSession.js';
import AttendanceRecord from './models/AttendanceRecord.js';
import AuditLog from './models/AuditLog.js';

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

// ---- Helper: Create Audit Log ----
async function createAuditLog(action, userId, userName, userRole, entityType, entityId, note, metadata = {}, req = null) {
  try {
    const auditEntry = new AuditLog({
      action,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      entity_type: entityType,
      entity_id: entityId,
      note,
      metadata,
      ip_address: req ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress) : null,
      user_agent: req ? req.headers['user-agent'] : null
    });
    await auditEntry.save();
    console.log(`✅ Audit log created: ${action} by ${userName}`);
  } catch (err) {
    console.error('❌ Failed to create audit log:', err.message);
  }
}

// ---- Register ----
app.post("/api/auth/register", async (req, res) => {
  try {
    const { 
      name, email, password, role, organization, phone, designation,
      age_bracket, district, state, consent_location, consent_attendance 
    } = req.body;

    // Trainee registration: phone-based (no email/password required initially)
    if (role === 'trainee') {
      if (!name || !phone) {
        return res.status(400).json({ 
          success: false, 
          error: "Trainee registration requires name and phone number" 
        });
      }

      if (!password) {
        return res.status(400).json({ 
          success: false, 
          error: "Please provide a password for your account" 
        });
      }

      // Check if phone already registered
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({ 
          success: false, 
          error: "This phone number is already registered" 
        });
      }

      // Hash the provided password
      const passwordHash = await bcrypt.hash(password, 10);

      // Only set email if provided and not empty/null
      const traineeData = {
        name: name.trim(),
        phone: phone.trim(),
        password: passwordHash,
        role: 'trainee',
        age_bracket,
        district,
        state,
        consent_location: consent_location || false,
        consent_attendance: consent_attendance || false,
        phone_verified: false, // Will be set to true after OTP verification
      };
      if (email && typeof email === 'string' && email.trim() !== '') {
        traineeData.email = email.trim().toLowerCase();
      }

      const newTrainee = new User(traineeData);

      await newTrainee.save();

      // Create audit log
      await createAuditLog('user_registered', newTrainee._id, newTrainee.name, 'trainee', 'user', newTrainee._id, 'Trainee registered via phone', { phone }, req);

      const traineeResponse = {
        id: newTrainee._id.toString(),
        name: newTrainee.name,
        phone: newTrainee.phone,
        role: newTrainee.role,
        age_bracket: newTrainee.age_bracket,
        district: newTrainee.district,
        state: newTrainee.state,
      };

      console.log(`✅ Trainee registered: ${newTrainee.phone}`);

      // Issue JWT token for trainee
      const token = jwt.sign(
        { userId: newTrainee._id.toString(), phone: newTrainee.phone, role: newTrainee.role, name: newTrainee.name },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.status(201).json({ 
        success: true, 
        user: traineeResponse,
        token,
        message: "Trainee registered successfully" 
      });
    }

    // Trainer/Authority registration: email-based
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
      role: role || 'authority',
      organization: organization || 'NDMA',
      phone: phone || '',
      designation: designation || '',
    });

    await newUser.save();

    // Create audit log
    await createAuditLog('user_registered', newUser._id, newUser.name, newUser.role, 'user', newUser._id, `${newUser.role} registered via email`, { email: newUser.email }, req);

    const userResponse = {
      id: newUser._id.toString(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      organization: newUser.organization,
      phone: newUser.phone,
      designation: newUser.designation,
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
        error: "Please provide email/phone and password" 
      });
    }

    // Check if input is phone number (10 digits) or email
    const isPhone = /^\d{10}$/.test(email.trim());
    
    let user;
    if (isPhone) {
      // Trainee login with phone
      user = await User.findOne({ phone: email.trim() });
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: "Phone number not registered. Please register first." 
        });
      }
    } else {
      // Trainer/Authority login with email
      const normalizedEmail = email.trim().toLowerCase();
      user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: "Email not registered. Please register first." 
        });
      }
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
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      organization: user.organization || '',
      age_bracket: user.age_bracket || '',
      district: user.district || '',
      state: user.state || '',
      createdAt: user.createdAt,
    };

    console.log(`✅ User logged in: ${user.phone || user.email}`);
    const token = jwt.sign(
      { 
        userId: user._id.toString(), 
        email: user.email || '', 
        phone: user.phone || '',
        role: user.role, 
        name: user.name 
      },
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

// ---- Update Profile ----
app.put('/api/auth/update-profile', authenticate, async (req, res) => {
  try {
    const { organization, designation, phone, name } = req.body;
    const update = {};
    if (organization) update.organization = organization;
    if (designation) update.designation = designation;
    if (phone) update.phone = phone;
    if (name) update.name = name;
    update.updatedAt = Date.now();

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    res.json({ success: true, user, message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// ========================================
// TRAINING REPORTS ENDPOINTS
// ========================================

// ---- Create Training Report ----
app.post("/api/reports/create", authenticate, async (req, res) => {
  try {
    console.log("📥 POST /api/reports/create received");
    console.log("👤 User ID:", req.user.id, "Type:", typeof req.user.id);
    console.log("📊 Request body:", JSON.stringify(req.body, null, 2));

    const {
      trainingType, location, date, participants, duration,
      description, effectiveness, photos, documents, userName, userEmail, session_token
    } = req.body;

    if (!trainingType || !location || !date) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Required fields: trainingType, location, date"
      });
    }

    // Convert string userId to MongoDB ObjectId
    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(req.user.id);
      console.log("✅ Converted userId to ObjectId:", userObjectId);
    } catch (err) {
      console.error("❌ Invalid userId format:", req.user.id);
      return res.status(400).json({
        success: false,
        error: "Invalid user ID format"
      });
    }

    // Fetch user organization
    const user = await User.findById(userObjectId);
    const userOrganization = user ? user.organization : 'NDMA';

    const newReport = new Report({
      userId: userObjectId,
      userEmail: userEmail || req.user.email,
      userName: userName || req.user.name || 'Unknown',
      userOrganization: userOrganization,
      trainingType,
      location,
      date,
      participants: Number(participants) || 0,
      duration,
      description,
      effectiveness,
      photos: Array.isArray(photos) ? photos : (photos ? [photos] : []),
      documents: documents || [],
    });

    // Auto-link attendance if session_token provided
    if (session_token) {
      try {
        const session = await AttendanceSession.findOne({ session_token });
        if (session) {
          const attendanceRecords = await AttendanceRecord.find({ session_id: session._id })
            .populate('user_id', 'name phone age_bracket district state');

          const attendanceDetails = attendanceRecords.map(record => ({
            traineeId: record.user_id?._id,
            traineeName: record.user_name || record.user_id?.name || 'Unknown',
            traineePhone: record.user_phone || record.user_id?.phone || '',
            traineeAge: record.user_id?.age_bracket || '',
            traineeDistrict: record.user_id?.district || '',
            traineeState: record.user_id?.state || '',
            markedAt: record.timestamp,
            method: record.method
          }));

          newReport.hasLiveAttendance = true;
          newReport.attendanceSessionId = session._id;
          newReport.attendanceCount = attendanceRecords.length;
          newReport.attendanceDetails = attendanceDetails;
          newReport.participants = attendanceRecords.length; // Override with actual attendance count

          console.log(`✅ Auto-linked attendance: ${attendanceRecords.length} trainees from session ${session_token}`);
        } else {
          console.log(`⚠️ Attendance session not found: ${session_token}`);
        }
      } catch (attendanceError) {
        console.error("⚠️ Failed to link attendance (non-critical):", attendanceError.message);
        // Continue creating report even if attendance linking fails
      }
    }

    console.log("💾 Attempting to save report:", JSON.stringify(newReport, null, 2));

    try {
      await newReport.save();
      console.log("✅ Report saved successfully with ID:", newReport._id);
      console.log("✅ Full saved report:", newReport);
    } catch (saveError) {
      console.error("❌ Save operation failed:", saveError.message);
      console.error("❌ Save error details:", saveError);
      return res.status(500).json({
        success: false,
        error: "Failed to save report: " + saveError.message
      });
    }

    res.status(201).json({
      success: true,
      report: newReport,
      message: "Training report created successfully"
    });

  } catch (error) {
    console.error("❌ Create report error:", error.message);
    console.error("❌ Full error stack:", error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to create report: " + error.message
    });
  }
});

// ---- Get User Reports ----
// Current user's reports (recommended)
app.get("/api/reports/user", authenticate, async (req, res) => {
  try {
    console.log("📥 GET /api/reports/user - User:", req.user.email);
    console.log("👤 User ID:", req.user.id, "Type:", typeof req.user.id);

    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(req.user.id);
      console.log("✅ Converted userId to ObjectId for query:", userObjectId);
    } catch (err) {
      console.log("❌ Invalid userId format:", req.user.id);
      return res.status(400).json({ success: false, error: "Invalid user ID format" });
    }

    console.log("🔍 Searching for reports with userId:", userObjectId);
    const reports = await Report.find({ userId: userObjectId }).sort({ createdAt: -1 });
    console.log("✅ Found reports:", reports.length);

    if (reports.length > 0) {
      console.log("📋 First report details:", {
        id: reports[0]._id,
        userId: reports[0].userId,
        userName: reports[0].userName,
        trainingType: reports[0].trainingType,
        createdAt: reports[0].createdAt
      });
    }

    res.json({ success: true, reports, count: reports.length });
  } catch (error) {
    console.error("❌ Get reports error:", error);
    res.status(500).json({ success: false, error: "Failed to get reports: " + error.message });
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

// ---- Get Analytics for Authority Dashboard ----
app.get("/api/reports/analytics", authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'authority') {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const reports = await Report.find();
    
    // Status breakdown
    const statusCounts = {
      draft: reports.filter(r => r.status === 'draft').length,
      pending: reports.filter(r => r.status === 'pending').length,
      accepted: reports.filter(r => r.status === 'accepted').length,
      rejected: reports.filter(r => r.status === 'rejected').length
    };

    // Organization breakdown
    const organizationCounts = {};
    reports.forEach(r => {
      const org = r.userOrganization || 'Unknown';
      organizationCounts[org] = (organizationCounts[org] || 0) + 1;
    });

    // Training type breakdown
    const trainingTypeCounts = {};
    reports.forEach(r => {
      const type = r.trainingType || 'Unknown';
      trainingTypeCounts[type] = (trainingTypeCounts[type] || 0) + 1;
    });

    // Monthly trends (last 6 months)
    const monthlyData = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = 0;
    }
    
    reports.forEach(r => {
      const date = new Date(r.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData.hasOwnProperty(key)) {
        monthlyData[key]++;
      }
    });

    // Accepted reports with full data (for detailed view)
    const acceptedReports = reports.filter(r => r.status === 'accepted');
    
    // Total participants from accepted reports
    const totalParticipants = acceptedReports.reduce((sum, r) => sum + (r.participants || 0), 0);

    res.json({
      success: true,
      analytics: {
        totalReports: reports.length,
        statusCounts,
        organizationCounts,
        trainingTypeCounts,
        monthlyData,
        totalParticipants,
        acceptedReportsCount: acceptedReports.length,
        acceptedReports: acceptedReports // Include all accepted reports with photos
      }
    });

  } catch (error) {
    console.error("Get analytics error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to get analytics" 
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

// ---- Send Report to Authority ----
app.put("/api/reports/send/:reportId", authenticate, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { organization } = req.body;

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    // Only owner can send
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Forbidden' });

    report.status = 'pending';
    report.sentToOrganization = organization || '';
    report.sentByUserName = req.user.name || report.userName || '';
    await report.save();

    res.json({ success: true, report, message: 'Report sent to authority' });
  } catch (error) {
    console.error('Send report error:', error);
    res.status(500).json({ success: false, error: 'Failed to send report' });
  }
});

// ---- Approve Report (Authority) ----
app.put("/api/reports/approve/:reportId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'authority') return res.status(403).json({ success: false, error: 'Forbidden' });

    const { reportId } = req.params;
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    report.status = 'accepted';
    report.reviewedBy = req.user.id;
    report.reviewedAt = new Date();
    await report.save();

    res.json({ success: true, report, message: 'Report approved' });
  } catch (error) {
    console.error('Approve report error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve report' });
  }
});

// ---- Reject Report (Authority) ----
app.put('/api/reports/reject/:reportId', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'authority') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { reportId } = req.params;
    const { reason } = req.body || {};
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    report.status = 'rejected';
    report.rejectionReason = reason || '';
    report.reviewedBy = req.user.id;
    report.reviewedAt = new Date();
    await report.save();
    res.json({ success: true, report, message: 'Report rejected' });
  } catch (error) {
    console.error('Reject report error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject report' });
  }
});

// ---- Delete Training Report ----
app.delete("/api/reports/delete/:reportId", authenticate, async (req, res) => {
  try {
    const { reportId } = req.params;
    console.log('🗑️ DELETE /api/reports/delete - Report ID:', reportId);
    console.log('👤 User:', req.user.email, '| Role:', req.user.role);

    // Validate reportId format
    if (!reportId || !reportId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('❌ Invalid report ID format:', reportId);
      return res.status(400).json({ success: false, error: "Invalid report ID format" });
    }

    // Only owner or authority can delete
    const existing = await Report.findById(reportId);
    if (!existing) {
      console.error('❌ Report not found:', reportId);
      return res.status(404).json({ success: false, error: "Report not found" });
    }
    
    console.log('📋 Found report - Owner:', existing.userEmail, '| Requesting user:', req.user.email);
    
    if (existing.userId.toString() !== req.user.id && req.user.role !== 'authority') {
      console.error('❌ Forbidden - User not owner or authority');
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const report = await Report.findByIdAndDelete(reportId);

    if (!report) {
      console.error('❌ Failed to delete report:', reportId);
      return res.status(404).json({ 
        success: false, 
        error: "Report not found" 
      });
    }

    console.log('✅ Report deleted successfully:', reportId);
    res.json({ 
      success: true, 
      message: "Report deleted successfully"
    });

  } catch (error) {
    console.error("❌ Delete report error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete report",
      details: error.message 
    });
  }
});

// ==================== ATTENDANCE ENDPOINTS ====================

// ---- Create Attendance Session (Trainer starts session) ----
app.post("/api/attendance/sessions", authenticate, async (req, res) => {
  try {
    const { training_id, mode, radius_m, hotspot_ssid, trainer_device, trainer_ip, location } = req.body;

    if (!training_id || !mode) {
      return res.status(400).json({ 
        success: false, 
        error: "training_id and mode are required" 
      });
    }

    if (!['hotspot', 'ble', 'gps', 'manual'].includes(mode)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid mode. Must be hotspot, ble, gps, or manual" 
      });
    }

    // Generate unique session token
    const session_token = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const newSession = new AttendanceSession({
      training_id,
      trainer_id: req.user.id,
      session_token,
      mode,
      radius_m: radius_m || 30,
      hotspot_ssid: hotspot_ssid || null,
      metadata: {
        trainer_device,
        trainer_ip,
        location: location ? {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        } : null
      },
      status: 'active'
    });

    await newSession.save();

    // Create audit log
    await createAuditLog(
      'attendance_session_started',
      req.user.id,
      req.user.name,
      req.user.role,
      'attendance_session',
      newSession._id,
      `Attendance session started in ${mode} mode`,
      { session_token, training_id, mode },
      req
    );

    console.log(`✅ Attendance session created: ${session_token} (${mode} mode)`);

    res.status(201).json({
      success: true,
      session: {
        id: newSession._id,
        session_token: newSession.session_token,
        training_id: newSession.training_id,
        mode: newSession.mode,
        radius_m: newSession.radius_m,
        status: newSession.status,
        started_at: newSession.started_at
      },
      message: "Attendance session created successfully"
    });

  } catch (error) {
    console.error("❌ Create session error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to create attendance session",
      details: error.message 
    });
  }
});

// ---- Get Session Status (For trainer real-time view) ----
app.get("/api/attendance/sessions/:session_token/status", authenticate, async (req, res) => {
  try {
    const { session_token } = req.params;

    const session = await AttendanceSession.findOne({ session_token })
      .populate('trainer_id', 'name phone');

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: "Session not found" 
      });
    }

    // Get attendance count for this session
    const attendanceCount = await AttendanceRecord.countDocuments({ session_id: session._id });

    // Get list of attendees
    const attendees = await AttendanceRecord.find({ session_id: session._id })
      .sort({ timestamp: -1 })
      .select('user_name user_phone method timestamp location device_meta')
      .limit(100);

    res.json({
      success: true,
      session: {
        id: session._id,
        session_token: session.session_token,
        training_id: session.training_id,
        mode: session.mode,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at,
        trainer: session.trainer_id,
        attendance_count: attendanceCount
      },
      attendees
    });

  } catch (error) {
    console.error("❌ Get session status error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to get session status",
      details: error.message 
    });
  }
});

// ---- Mark Attendance (Trainee confirms attendance) ----
app.post("/api/attendance/sessions/:session_token/mark", authenticate, async (req, res) => {
  try {
    const { session_token } = req.params;
    const { user_name, user_phone, method, device_meta, location } = req.body;

    const session = await AttendanceSession.findOne({ session_token, status: 'active' });

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: "Session not found or expired" 
      });
    }

    // Check if user already marked attendance for this session
    const existing = await AttendanceRecord.findOne({ 
      session_id: session._id, 
      user_id: req.user.id 
    });

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        error: "Attendance already marked for this session" 
      });
    }

    // Create attendance record
    const attendanceRecord = new AttendanceRecord({
      session_id: session._id,
      training_id: session.training_id,
      user_id: req.user.id,
      user_name: user_name || req.user.name,
      user_phone: user_phone || req.user.phone,
      method: method || session.mode,
      device_meta,
      location: location ? {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
        accuracy: location.accuracy
      } : null,
      synced: true, // Already synced since it's coming to backend
      verified: false
    });

    await attendanceRecord.save();

    // Create audit log
    await createAuditLog(
      'attendance_marked',
      req.user.id,
      req.user.name,
      req.user.role,
      'attendance_record',
      attendanceRecord._id,
      `Attendance marked via ${method || session.mode}`,
      { session_token, training_id: session.training_id },
      req
    );

    console.log(`✅ Attendance marked: ${req.user.name} → session ${session_token}`);

    res.status(201).json({
      success: true,
      attendance: {
        id: attendanceRecord._id,
        session_id: attendanceRecord.session_id,
        user_name: attendanceRecord.user_name,
        method: attendanceRecord.method,
        timestamp: attendanceRecord.timestamp
      },
      message: "Attendance marked successfully"
    });

  } catch (error) {
    console.error("❌ Mark attendance error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to mark attendance",
      details: error.message 
    });
  }
});

// ---- Batch Upload Attendance (Offline sync) ----
app.post("/api/attendance/sessions/:session_token/batch", authenticate, async (req, res) => {
  try {
    const { session_token } = req.params;
    const { records } = req.body; // Array of attendance records

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "records array is required and cannot be empty" 
      });
    }

    const session = await AttendanceSession.findOne({ session_token });

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: "Session not found" 
      });
    }

    const inserted = [];
    const errors = [];

    for (const record of records) {
      try {
        // Check if already exists
        const existing = await AttendanceRecord.findOne({
          session_id: session._id,
          user_id: record.user_id
        });

        if (existing) {
          errors.push({ user_id: record.user_id, error: "Duplicate attendance" });
          continue;
        }

        const attendanceRecord = new AttendanceRecord({
          session_id: session._id,
          training_id: session.training_id,
          user_id: record.user_id,
          user_name: record.user_name,
          user_phone: record.user_phone,
          method: record.method || session.mode,
          timestamp: record.timestamp || new Date(),
          device_meta: record.device_meta,
          location: record.location ? {
            type: 'Point',
            coordinates: [record.location.longitude, record.location.latitude],
            accuracy: record.location.accuracy
          } : null,
          synced: true
        });

        await attendanceRecord.save();
        inserted.push(attendanceRecord._id);

      } catch (err) {
        errors.push({ user_id: record.user_id, error: err.message });
      }
    }

    console.log(`✅ Batch attendance uploaded: ${inserted.length} records (${errors.length} errors)`);

    res.json({
      success: true,
      inserted: inserted.length,
      errors: errors.length,
      details: errors.length > 0 ? errors : undefined,
      message: `${inserted.length} attendance records synced successfully`
    });

  } catch (error) {
    console.error("❌ Batch attendance error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to sync batch attendance",
      details: error.message 
    });
  }
});

// ---- Get Attendance for Training ----
app.get("/api/trainings/:id/attendance", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const attendanceRecords = await AttendanceRecord.find({ training_id: id })
      .populate('user_id', 'name phone')
      .populate('session_id', 'mode started_at')
      .sort({ timestamp: -1 });

    const total = attendanceRecords.length;
    const byMethod = attendanceRecords.reduce((acc, record) => {
      acc[record.method] = (acc[record.method] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      training_id: id,
      total,
      by_method: byMethod,
      records: attendanceRecords.map(r => ({
        id: r._id,
        user_name: r.user_name,
        user_phone: r.user_phone,
        method: r.method,
        timestamp: r.timestamp,
        verified: r.verified,
        location: r.location
      }))
    });

  } catch (error) {
    console.error("❌ Get attendance error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to get attendance",
      details: error.message 
    });
  }
});

// ---- End Attendance Session ----
app.put("/api/attendance/sessions/:session_token/end", authenticate, async (req, res) => {
  try {
    const { session_token } = req.params;

    const session = await AttendanceSession.findOne({ session_token });

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: "Session not found" 
      });
    }

    session.status = 'completed';
    session.ended_at = new Date();
    session.updatedAt = new Date();

    await session.save();

    // Create audit log
    await createAuditLog(
      'attendance_session_ended',
      req.user.id,
      req.user.name,
      req.user.role,
      'attendance_session',
      session._id,
      `Attendance session ended`,
      { session_token },
      req
    );

    console.log(`✅ Attendance session ended: ${session_token}`);

    res.json({
      success: true,
      message: "Attendance session ended successfully"
    });

  } catch (error) {
    console.error("❌ End session error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to end session",
      details: error.message 
    });
  }
});

// ==================== END ATTENDANCE ENDPOINTS ====================

// ---- Link Attendance Session to Report ----
app.post("/api/reports/:reportId/link-attendance", authenticate, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { session_token } = req.body;

    if (!session_token) {
      return res.status(400).json({ 
        success: false, 
        error: "session_token is required" 
      });
    }

    // Find the attendance session
    const session = await AttendanceSession.findOne({ session_token });
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: "Attendance session not found" 
      });
    }

    // Get all attendance records for this session with trainee details
    const attendanceRecords = await AttendanceRecord.find({ session_id: session._id })
      .populate('user_id', 'name phone age_bracket district state');

    // Format attendance details
    const attendanceDetails = attendanceRecords.map(record => ({
      traineeId: record.user_id?._id,
      traineeName: record.user_name || record.user_id?.name || 'Unknown',
      traineePhone: record.user_phone || record.user_id?.phone || '',
      traineeAge: record.user_id?.age_bracket || '',
      traineeDistrict: record.user_id?.district || '',
      traineeState: record.user_id?.state || '',
      markedAt: record.timestamp,
      method: record.method
    }));

    // Update report with attendance data
    const report = await Report.findByIdAndUpdate(
      reportId,
      {
        hasLiveAttendance: true,
        attendanceSessionId: session._id,
        attendanceCount: attendanceRecords.length,
        attendanceDetails,
        participants: attendanceRecords.length, // Update participants count
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ 
        success: false, 
        error: "Report not found" 
      });
    }

    console.log(`✅ Linked attendance session ${session_token} to report ${reportId}`);

    res.json({
      success: true,
      report,
      attendanceCount: attendanceRecords.length,
      message: "Attendance linked to report successfully"
    });

  } catch (error) {
    console.error("❌ Link attendance error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to link attendance to report",
      details: error.message 
    });
  }
});

// ---- Authority Analytics with Attendance Data ----
app.get("/api/reports/analytics-with-attendance", authenticate, async (req, res) => {
  try {
    // Verify user is authority
    if (req.user.role !== 'authority') {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied. Authority role required." 
      });
    }

    // Get all accepted reports with attendance
    const reportsWithAttendance = await Report.find({ 
      hasLiveAttendance: true,
      status: 'accepted'
    }).select('training_title location attendanceCount attendanceDetails createdAt');

    // Calculate analytics
    let totalReportsWithAttendance = reportsWithAttendance.length;
    let totalTrainees = 0;
    let ageDistribution = {};
    let districtDistribution = {};
    let stateDistribution = {};
    let methodDistribution = {};

    reportsWithAttendance.forEach(report => {
      totalTrainees += report.attendanceCount || 0;

      report.attendanceDetails?.forEach(detail => {
        // Age distribution
        const age = detail.traineeAge || 'Unknown';
        ageDistribution[age] = (ageDistribution[age] || 0) + 1;

        // District distribution
        const district = detail.traineeDistrict || 'Unknown';
        districtDistribution[district] = (districtDistribution[district] || 0) + 1;

        // State distribution
        const state = detail.traineeState || 'Unknown';
        stateDistribution[state] = (stateDistribution[state] || 0) + 1;

        // Method distribution
        const method = detail.method || 'Unknown';
        methodDistribution[method] = (methodDistribution[method] || 0) + 1;
      });
    });

    // Get top 5 districts and states
    const topDistricts = Object.entries(districtDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([district, count]) => ({ district, count }));

    const topStates = Object.entries(stateDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([state, count]) => ({ state, count }));

    // Recent trainings with high attendance
    const topTrainings = reportsWithAttendance
      .sort((a, b) => (b.attendanceCount || 0) - (a.attendanceCount || 0))
      .slice(0, 5)
      .map(r => ({
        title: r.training_title,
        location: r.location,
        attendanceCount: r.attendanceCount,
        date: r.createdAt
      }));

    res.json({
      success: true,
      analytics: {
        summary: {
          totalReportsWithAttendance,
          totalTrainees,
          averageAttendancePerReport: totalReportsWithAttendance > 0 
            ? Math.round(totalTrainees / totalReportsWithAttendance) 
            : 0
        },
        demographics: {
          ageDistribution,
          topDistricts,
          topStates
        },
        attendance: {
          methodDistribution,
          topTrainings
        }
      }
    });

  } catch (error) {
    console.error("❌ Analytics error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch analytics",
      details: error.message 
    });
  }
});

// ---- Get Reports by Organization and Date (for Authority Live Map) ----
app.get("/api/reports/live-map", authenticate, async (req, res) => {
  try {
    // Verify user is authority
    if (req.user.role !== 'authority') {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied. Authority role required." 
      });
    }

    const { organization, date } = req.query;
    
    // Build filter query
    let filter = { status: 'accepted' }; // Only show accepted reports
    
    // Filter by organization if provided
    if (organization && organization !== 'all') {
      filter.userOrganization = organization;
    }
    
    // Filter by date if provided (format: YYYY-MM-DD)
    if (date) {
      // Match reports where date field starts with the given date
      filter.date = { $regex: `^${date}` };
    }

    const reports = await Report.find(filter)
      .select('userOrganization trainingType location date participants userName userEmail hasLiveAttendance attendanceCount createdAt')
      .sort({ createdAt: -1 });

    // Group by organization
    const organizationStats = {};
    reports.forEach(report => {
      const org = report.userOrganization || 'Unknown';
      if (!organizationStats[org]) {
        organizationStats[org] = {
          count: 0,
          totalParticipants: 0,
          locations: []
        };
      }
      organizationStats[org].count += 1;
      organizationStats[org].totalParticipants += report.participants || 0;
      organizationStats[org].locations.push({
        latitude: report.location.latitude,
        longitude: report.location.longitude,
        name: report.location.name
      });
    });

    res.json({
      success: true,
      reports,
      stats: {
        total: reports.length,
        byOrganization: organizationStats
      },
      filters: {
        organization: organization || 'all',
        date: date || 'all'
      }
    });

  } catch (error) {
    console.error("❌ Live map data error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch live map data",
      details: error.message 
    });
  }
});

// ---- Get Organization-wise Analytics ----
app.get("/api/reports/analytics-by-organization", authenticate, async (req, res) => {
  try {
    // Verify user is authority
    if (req.user.role !== 'authority') {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied. Authority role required." 
      });
    }

    const { organization } = req.query;

    // Build filter
    let filter = {};
    if (organization && organization !== 'all') {
      filter.userOrganization = organization;
    }

    const reports = await Report.find(filter);

    // Overall stats
    const totalReports = reports.length;
    const totalParticipants = reports.reduce((sum, r) => sum + (r.participants || 0), 0);
    const reportsWithAttendance = reports.filter(r => r.hasLiveAttendance).length;
    const totalAttendance = reports.reduce((sum, r) => sum + (r.attendanceCount || 0), 0);

    // Status breakdown
    const statusBreakdown = {
      draft: reports.filter(r => r.status === 'draft').length,
      pending: reports.filter(r => r.status === 'pending').length,
      accepted: reports.filter(r => r.status === 'accepted').length,
      rejected: reports.filter(r => r.status === 'rejected').length
    };

    // Training type breakdown
    const trainingTypes = {};
    reports.forEach(r => {
      const type = r.trainingType || 'Unknown';
      trainingTypes[type] = (trainingTypes[type] || 0) + 1;
    });

    // Organization breakdown (if showing all)
    const organizations = {};
    if (!organization || organization === 'all') {
      reports.forEach(r => {
        const org = r.userOrganization || 'Unknown';
        if (!organizations[org]) {
          organizations[org] = {
            count: 0,
            participants: 0,
            withAttendance: 0
          };
        }
        organizations[org].count += 1;
        organizations[org].participants += r.participants || 0;
        if (r.hasLiveAttendance) organizations[org].withAttendance += 1;
      });
    }

    // Monthly trend (last 6 months)
    const monthlyTrend = {};
    reports.forEach(r => {
      const date = new Date(r.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrend[monthKey] = (monthlyTrend[monthKey] || 0) + 1;
    });

    // Demographics from attendance details
    const demographics = {
      age: {},
      district: {},
      state: {}
    };

    reports.forEach(report => {
      report.attendanceDetails?.forEach(detail => {
        // Age
        const age = detail.traineeAge || 'Unknown';
        demographics.age[age] = (demographics.age[age] || 0) + 1;

        // District
        const district = detail.traineeDistrict || 'Unknown';
        demographics.district[district] = (demographics.district[district] || 0) + 1;

        // State
        const state = detail.traineeState || 'Unknown';
        demographics.state[state] = (demographics.state[state] || 0) + 1;
      });
    });

    res.json({
      success: true,
      organization: organization || 'all',
      summary: {
        totalReports,
        totalParticipants,
        reportsWithAttendance,
        totalAttendance,
        averageParticipants: totalReports > 0 ? Math.round(totalParticipants / totalReports) : 0,
        averageAttendance: reportsWithAttendance > 0 ? Math.round(totalAttendance / reportsWithAttendance) : 0
      },
      breakdowns: {
        status: statusBreakdown,
        trainingTypes,
        organizations: organization === 'all' || !organization ? organizations : null
      },
      trends: {
        monthly: monthlyTrend
      },
      demographics
    });

  } catch (error) {
    console.error("❌ Organization analytics error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch organization analytics",
      details: error.message 
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

    // Seed default authority user if missing
    try {
      const seedEmail = 'authority@training.gov.in';
      const seedPass = 'authority123';
      const existing = await User.findOne({ email: seedEmail.toLowerCase() });
      if (!existing) {
        const passwordHash = await bcrypt.hash(seedPass, 10);
        const seeded = new User({
          name: 'Central Authority',
          email: seedEmail.toLowerCase(),
          password: passwordHash,
          role: 'authority',
          organization: 'Central Authority',
          phone: '',
          designation: 'Administrator'
        });
        await seeded.save();
        console.log(`🌱 Seeded central authority: ${seedEmail} / ${seedPass}`);
      } else {
        console.log(`🔎 Authority account present: ${seedEmail}`);
      }
    } catch (seedErr) {
      console.warn('⚠️ Authority seed failed:', seedErr.message);
    }

    // Seed demo trainer accounts for all organizations
    const demoTrainers = [
      {
        name: 'NDMA Trainer',
        email: 'divyanshu@ndma.gov.in',
        password: '123456',
        organization: 'NDMA',
        designation: 'Training Officer'
      },
      {
        name: 'LBSNAA Trainer',
        email: 'trainer@lbsnaa.gov.in',
        password: '123456',
        organization: 'LBSNAA',
        designation: 'Training Officer'
      },
      {
        name: 'ATI Trainer',
        email: 'trainer@ati.gov.in',
        password: '123456',
        organization: 'ATI',
        designation: 'Training Officer'
      },
      {
        name: 'SDMA Trainer',
        email: 'trainer@sdma.gov.in',
        password: '123456',
        organization: 'SDMA',
        designation: 'Training Officer'
      }
    ];

    for (const trainerData of demoTrainers) {
      try {
        const existing = await User.findOne({ email: trainerData.email.toLowerCase() });
        if (!existing) {
          const passwordHash = await bcrypt.hash(trainerData.password, 10);
          const trainer = new User({
            ...trainerData,
            email: trainerData.email.toLowerCase(),
            password: passwordHash,
            role: 'trainer',
            phone: ''
          });
          await trainer.save();
          console.log(`🌱 Seeded ${trainerData.organization} trainer: ${trainerData.email} / ${trainerData.password}`);
        } else {
          // Update password for existing NDMA trainer (divyanshu)
          if (trainerData.email === 'divyanshu@ndma.gov.in') {
            const passwordHash = await bcrypt.hash('123456', 10);
            existing.password = passwordHash;
            await existing.save();
            console.log(`🔄 Updated password for: ${trainerData.email} / 123456`);
          } else {
            console.log(`🔎 Trainer account present: ${trainerData.email}`);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Failed to seed trainer ${trainerData.email}:`, err.message);
      }
    }

    // Seed demo trainee user if missing
    try {
      const demoPhone = '9999999999';
      const demoPass = 'trainee123';
      const demoTrainee = await User.findOne({ phone: demoPhone });
      if (!demoTrainee) {
        const passwordHash = await bcrypt.hash(demoPass, 10);
        const seededTrainee = new User({
          name: 'Demo Trainee',
          phone: demoPhone,
          password: passwordHash,
          role: 'trainee',
          age_bracket: '18-25',
          district: 'DemoDistrict',
          state: 'DemoState',
          consent_location: true,
          consent_attendance: true,
          phone_verified: true
        });
        await seededTrainee.save();
        console.log(`🌱 Seeded demo trainee: ${demoPhone} / ${demoPass}`);
      } else {
        console.log(`🔎 Demo trainee present: ${demoPhone}`);
      }
    } catch (seedErr) {
      console.warn('⚠️ Demo trainee seed failed:', seedErr.message);
    }

    app.listen(PORT, HOST, () => {
      console.log(`\n🚀 Auth Backend running on:`);
      console.log(`   http://${HOST}:${PORT}`);
      console.log(`\n📋 Auth Endpoints:`);
      console.log(`  POST   /api/auth/register`);
      console.log(`  POST   /api/auth/login`);
      console.log(`  GET    /api/auth/user/:userId`);
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
