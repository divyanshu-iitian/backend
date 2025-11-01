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

async function setupNdmaAuthDb() {
  try {
    console.log('🔄 Connecting to MongoDB (ndma_auth_db)...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📂 Database:', mongoose.connection.name);

    const User = mongoose.model('User', userSchema);

    // Create main user
    const mainUser = {
      email: 'divyanshu@ndma.gov.in',
      password: 'trainer123',
      name: 'Divyanshu Mishra',
      role: 'trainer',
      organization: 'NDMA Training Institute',
      phone: '+91-98765-43210'
    };

    const existing = await User.findOne({ email: mainUser.email });
    if (existing) {
      console.log('✅ User already exists:', mainUser.email);
      console.log('   User ID:', existing._id);
      console.log('   Name:', existing.name);
    } else {
      const hashedPassword = await bcrypt.hash(mainUser.password, 10);
      const user = new User({
        ...mainUser,
        password: hashedPassword
      });

      await user.save();
      console.log('✅ Created user:', mainUser.email);
      console.log('   User ID:', user._id);
    }

    console.log('\n📱 Login Credentials:');
    console.log('─────────────────────────');
    console.log('Email:', mainUser.email);
    console.log('Password:', mainUser.password);
    console.log('─────────────────────────');
    console.log('\n✅ Database: ndma_auth_db is ready!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupNdmaAuthDb();