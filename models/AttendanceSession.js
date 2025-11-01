import mongoose from 'mongoose';

// Attendance Session Schema
const attendanceSessionSchema = new mongoose.Schema({
  training_id: { type: mongoose.Schema.Types.Mixed, required: true }, // Accept ObjectId or String for flexibility
  trainer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  session_token: { type: String, required: true, unique: true },
  mode: { 
    type: String, 
    enum: ['hotspot', 'ble', 'gps', 'manual'], 
    required: true 
  },
  radius_m: { type: Number, default: 30 }, // For GPS mode
  hotspot_ssid: String, // For hotspot mode
  started_at: { type: Date, default: Date.now },
  ended_at: Date,
  synced: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['active', 'completed', 'expired'], 
    default: 'active' 
  },
  metadata: {
    trainer_device: String,
    trainer_ip: String,
    location: {
      type: { type: String, default: 'Point' },
      coordinates: [Number] // [longitude, latitude]
    }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for fast session lookup
attendanceSessionSchema.index({ session_token: 1 });
attendanceSessionSchema.index({ training_id: 1, status: 1 });
attendanceSessionSchema.index({ trainer_id: 1, started_at: -1 });

const AttendanceSession = mongoose.model('AttendanceSession', attendanceSessionSchema);

export default AttendanceSession;
