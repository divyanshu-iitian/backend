// Quick MongoDB connection test
import mongoose from 'mongoose';

// CORRECT CONNECTION STRING (Cluster0 with correct password)
const MONGODB_URI = 'mongodb+srv://divyanshumishra0208_db_user:e4SrFhSNcuUOsAnJ@cluster0.jsbvffu.mongodb.net/ndma-training?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔄 Testing MongoDB connection...');
console.log('Connection string:', MONGODB_URI);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000
})
.then(() => {
  console.log('✅ MongoDB connection successful!');
  console.log('Database:', mongoose.connection.db.databaseName);
  process.exit(0);
})
.catch((error) => {
  console.error('❌ MongoDB connection failed!');
  console.error('Error:', error.message);
  console.error('Error code:', error.code);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏰ Connection timeout after 10 seconds');
  process.exit(1);
}, 10000);
