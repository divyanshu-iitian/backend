// Check current database state
import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://divyanshumishra0208_db_user:e4SrFhSNcuUOsAnJ@cluster0.jsbvffu.mongodb.net/ndma-training?retryWrites=true&w=majority&appName=Cluster0';

// User Schema (same as auth-server.js)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String },
  password: { type: String, required: true },
  role: { type: String, enum: ['trainer', 'authority', 'trainee'], default: 'authority' },
  organization: { type: String },
  phone: { type: String },
  created_at: { type: Date, default: Date.now },
  last_login: { type: Date }
});

const User = mongoose.model('User', userSchema);

// Report Schema
const reportSchema = new mongoose.Schema({
  trainer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trainer_name: { type: String, required: true },
  organization: { type: String },
  training_title: { type: String, required: true },
  location: { type: String, required: true },
  date: { type: Date, required: true },
  duration_hours: { type: Number, required: true },
  participants_count: { type: Number, required: true },
  topics_covered: [String],
  feedback_summary: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  created_at: { type: Date, default: Date.now }
});

const Report = mongoose.model('Report', reportSchema);

async function checkDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check Users
    console.log('\n📊 CHECKING USERS:');
    const users = await User.find({}).select('name email phone role organization');
    console.log(`Total users: ${users.length}`);
    
    if (users.length > 0) {
      console.log('\n👥 User List:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log(`   Phone: ${user.phone || 'N/A'}`);
        console.log(`   Organization: ${user.organization || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('❌ No users found in database!');
    }
    
    // Check Reports
    console.log('\n📊 CHECKING REPORTS:');
    const reports = await Report.find({}).select('training_title trainer_name organization status date');
    console.log(`Total reports: ${reports.length}`);
    
    if (reports.length > 0) {
      console.log('\n📝 Report List:');
      reports.forEach((report, index) => {
        console.log(`${index + 1}. ${report.training_title}`);
        console.log(`   Trainer: ${report.trainer_name}`);
        console.log(`   Organization: ${report.organization || 'N/A'}`);
        console.log(`   Status: ${report.status}`);
        console.log(`   Date: ${report.date.toLocaleDateString()}`);
        console.log('');
      });
    } else {
      console.log('❌ No reports found in database!');
    }
    
    // Check what we need for app
    console.log('\n🎯 APP REQUIREMENTS CHECK:');
    
    // 1. Authority user
    const authority = await User.findOne({ role: 'authority' });
    console.log(`✅ Authority user: ${authority ? authority.name + ' (' + authority.email + ')' : '❌ MISSING'}`);
    
    // 2. Trainer users
    const trainers = await User.find({ role: 'trainer' });
    console.log(`✅ Trainer users: ${trainers.length} found`);
    if (trainers.length > 0) {
      trainers.forEach(t => console.log(`   - ${t.name} (${t.email})`));
    }
    
    // 3. Trainee users
    const trainees = await User.find({ role: 'trainee' });
    console.log(`✅ Trainee users: ${trainees.length} found`);
    if (trainees.length > 0) {
      trainees.forEach(t => console.log(`   - ${t.name} (${t.phone})`));
    }
    
    // 4. Check for duplicate issues
    console.log('\n⚠️ CHECKING FOR ISSUES:');
    
    // Empty phone duplicates
    const emptyPhones = await User.find({ phone: '' });
    if (emptyPhones.length > 1) {
      console.log(`⚠️ Found ${emptyPhones.length} users with empty phone (duplicate key issue)`);
    }
    
    // Users without organization
    const noOrg = await User.find({ organization: { $exists: false } });
    if (noOrg.length > 0) {
      console.log(`⚠️ Found ${noOrg.length} users without organization`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDatabase();
