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

async function createGmUser() {
  try {
    console.log('🔄 Connecting to MongoDB (ndma_auth_db)...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📂 Database:', mongoose.connection.name);

    const User = mongoose.model('User', userSchema);

    // Create g@m user (matching your existing user)
    const gmUser = {
      email: 'g@m',
      password: '123',
      name: 'Divyanshu Mishra',
      role: 'trainer',
      organization: 'NDMA Training Institute'
    };

    const existing = await User.findOne({ email: gmUser.email });
    if (existing) {
      console.log('✅ User already exists:', gmUser.email);
      console.log('   User ID:', existing._id);
      console.log('   Name:', existing.name);
    } else {
      const hashedPassword = await bcrypt.hash(gmUser.password, 10);
      const user = new User({
        ...gmUser,
        password: hashedPassword
      });

      await user.save();
      console.log('✅ Created user:', gmUser.email);
      console.log('   User ID:', user._id);
    }

    console.log('\n📱 Login Credentials:');
    console.log('─────────────────────────');
    console.log('Email:', gmUser.email);
    console.log('Password:', gmUser.password);
    console.log('─────────────────────────');

    // Show all users
    const allUsers = await User.find({});
    console.log('\n👥 All users in ndma_auth_db:');
    allUsers.forEach((u, i) => {
      console.log(`${i+1}. ${u.email} - ${u.name} (${u._id})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createGmUser();