import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// Create a test JWT token (replace with actual user data)
const testUser = {
  userId: "507f1f77bcf86cd799439011", // Example ObjectId
  email: "test@example.com",
  name: "Test User",
  role: "trainer"
};

const token = jwt.sign(testUser, JWT_SECRET);
console.log("Test JWT Token:", token);

// Test API call
const testReportData = {
  userName: "Test User",
  userEmail: "test@example.com",
  trainingType: "Fire Safety Training",
  location: {
    name: "Training Center",
    latitude: 28.6139,
    longitude: 77.2090
  },
  date: "2024-01-15",
  participants: 25,
  duration: "2 hours",
  description: "Basic fire safety training",
  effectiveness: "Good",
  photos: ["https://example.com/photo1.jpg"],
  documents: []
};

console.log("Test Report Data:", JSON.stringify(testReportData, null, 2));