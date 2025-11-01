import mongoose from 'mongoose';

// Attendance Record Schema
const attendanceRecordSchema = new mongoose.Schema({
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
  training_id: { type: mongoose.Schema.Types.Mixed, required: true }, // Accept ObjectId or String for flexibility
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  user_phone: String,
  method: { 
    type: String, 
    enum: ['hotspot', 'ble', 'gps', 'manual'], 
    required: true 
  },
  timestamp: { type: Date, default: Date.now },
  device_meta: {
    device_id: String, // Hashed device ID for audit
    device_name: String,
    os: String, // 'android', 'ios'
    app_version: String,
    connected_ssid: String, // For hotspot mode
    mac_address: String // Hashed MAC for audit
  },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number], // [longitude, latitude]
    accuracy: Number // GPS accuracy in meters
  },
  synced: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  verification_note: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for fast queries
attendanceRecordSchema.index({ session_id: 1 });
attendanceRecordSchema.index({ training_id: 1 });
attendanceRecordSchema.index({ user_id: 1, training_id: 1 });
attendanceRecordSchema.index({ synced: 1, createdAt: -1 });
attendanceRecordSchema.index({ timestamp: -1 });

const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);

export default AttendanceRecord;
