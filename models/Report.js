import mongoose from 'mongoose';

const LocationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
}, { _id: false });

const FileSchema = new mongoose.Schema({
  url: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String },
}, { _id: false });

const ReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail: { type: String, required: true },
  userName: { type: String, default: 'Unknown' },
  userOrganization: { type: String, default: 'NDMA' }, // Organization of reporter
  trainingType: { type: String, required: true },
  location: { type: LocationSchema, required: true },
  date: { type: String, required: true },
  participants: { type: Number, default: 0 },
  duration: { type: String, default: '' },
  description: { type: String, default: '' },
  effectiveness: { type: String, default: '' },
  photos: [{ type: String }],
  documents: [FileSchema],
  
  // Attendance fields
  hasLiveAttendance: { type: Boolean, default: false },
  attendanceSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession' },
  attendanceCount: { type: Number, default: 0 },
  attendanceDetails: [{
    traineeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    traineeName: String,
    traineePhone: String,
    traineeAge: String,
    traineeDistrict: String,
    traineeState: String,
    markedAt: Date,
    method: String
  }],
  
  // Workflow fields for authority review
  status: { type: String, enum: ['draft', 'pending', 'accepted', 'rejected'], default: 'draft' },
  sentToOrganization: { type: String, default: '' }, // Which org received this
  sentByUserName: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who approved/rejected
  reviewedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('Report', ReportSchema);
