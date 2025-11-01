import mongoose from 'mongoose';

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
  action: { 
    type: String, 
    required: true,
    enum: [
      'report_created', 
      'report_updated', 
      'report_approved', 
      'report_rejected',
      'report_sent',
      'attendance_session_started',
      'attendance_session_ended',
      'attendance_marked',
      'attendance_verified',
      'user_registered',
      'user_login',
      'user_updated',
      'training_created',
      'training_updated'
    ]
  },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: String,
  user_role: String,
  entity_type: { 
    type: String, 
    enum: ['report', 'training', 'attendance_session', 'attendance_record', 'user'] 
  },
  entity_id: mongoose.Schema.Types.ObjectId,
  note: String,
  metadata: mongoose.Schema.Types.Mixed, // Flexible for any additional data
  ip_address: String,
  user_agent: String,
  timestamp: { type: Date, default: Date.now }
});

// Indexes for fast audit queries
auditLogSchema.index({ user_id: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ entity_id: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
