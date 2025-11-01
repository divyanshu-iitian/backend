import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

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

async function createProductionUsers() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = mongoose.model('User', userSchema);

    // Create multiple test users
    const users = [
      {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'trainer'
      },
      {
        email: 'divyanshu@ndma.gov.in',
        password: 'trainer123',
        name: 'Divyanshu Mishra',
        role: 'trainer'
      },
      {
        email: 'trainer@ndma.gov.in',
        password: 'trainer123',
        name: 'NDMA Trainer',
        role: 'trainer'
      }
    ];

    console.log('📝 Creating users...');
    
    for (const userData of users) {
      const existing = await User.findOne({ email: userData.email });
      if (existing) {
        console.log(`✅ User already exists: ${userData.email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = new User({
        ...userData,
        password: hashedPassword,
        organization: 'NDMA Training Institute'
      });

      await user.save();
      console.log(`✅ Created user: ${userData.email}`);
      console.log(`   Password: ${userData.password}`);
    }

    console.log('\n📱 Login credentials:');
    console.log('─────────────────────────');
    users.forEach(u => {
      console.log(`Email: ${u.email}`);
      console.log(`Password: ${u.password}`);
      console.log('─────────────────────────');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createProductionUsers();