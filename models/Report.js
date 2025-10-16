const mongoose = require('mongoose');

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
  trainingType: { type: String, required: true },
  location: { type: LocationSchema, required: true },
  date: { type: String, required: true },
  participants: { type: Number, default: 0 },
  duration: { type: String, default: '' },
  description: { type: String, default: '' },
  effectiveness: { type: String, default: '' },
  photos: [{ type: String }],
  documents: [FileSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Report', ReportSchema);
