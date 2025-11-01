// Create demo reports for testing
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MONGODB_URI = 'mongodb+srv://divyanshumishra0208_db_user:e4SrFhSNcuUOsAnJ@cluster0.jsbvffu.mongodb.net/ndma-training?retryWrites=true&w=majority&appName=Cluster0';

// Schemas
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  organization: String
}, { strict: false });

const reportSchema = new mongoose.Schema({
  trainer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trainer_name: { type: String, required: true },
  organization: { type: String, required: true },
  training_title: { type: String, required: true },
  location: { type: String, required: true },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  date: { type: Date, required: true },
  duration_hours: { type: Number, required: true },
  participants_count: { type: Number, required: true },
  topics_covered: [String],
  feedback_summary: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Report = mongoose.model('Report', reportSchema);

async function createDemoReports() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get trainers
    const trainers = await User.find({ role: 'trainer' });
    console.log(`Found ${trainers.length} trainers\n`);

    // Delete existing reports for clean start
    await Report.deleteMany({});
    console.log('🗑️ Cleared existing reports\n');

    // Demo reports data
    const demoReports = [
      {
        training_title: 'Earthquake Preparedness Training',
        location: 'Delhi, India',
        coordinates: { latitude: 28.7041, longitude: 77.1025 },
        date: new Date('2024-10-15'),
        duration_hours: 6,
        participants_count: 45,
        topics_covered: ['Earthquake basics', 'Safety measures', 'Emergency response', 'First aid'],
        feedback_summary: 'Excellent training session. Participants were highly engaged.',
        status: 'approved'
      },
      {
        training_title: 'Flood Management Workshop',
        location: 'Mumbai, Maharashtra',
        coordinates: { latitude: 19.0760, longitude: 72.8777 },
        date: new Date('2024-10-20'),
        duration_hours: 4,
        participants_count: 30,
        topics_covered: ['Flood warning systems', 'Evacuation procedures', 'Water safety'],
        feedback_summary: 'Good practical demonstrations. More time needed for Q&A.',
        status: 'approved'
      },
      {
        training_title: 'Fire Safety Training',
        location: 'Bangalore, Karnataka',
        coordinates: { latitude: 12.9716, longitude: 77.5946 },
        date: new Date('2024-10-25'),
        duration_hours: 5,
        participants_count: 50,
        topics_covered: ['Fire prevention', 'Use of fire extinguishers', 'Evacuation drills'],
        feedback_summary: 'Hands-on training was very effective. Participants appreciated practical exercises.',
        status: 'pending'
      },
      {
        training_title: 'Cyclone Preparedness Program',
        location: 'Visakhapatnam, Andhra Pradesh',
        coordinates: { latitude: 17.6869, longitude: 83.2185 },
        date: new Date('2024-10-28'),
        duration_hours: 4,
        participants_count: 35,
        topics_covered: ['Cyclone tracking', 'Shelter management', 'Post-cyclone recovery'],
        feedback_summary: 'Relevant for coastal communities. Need more region-specific content.',
        status: 'approved'
      },
      {
        training_title: 'Disaster Communication Systems',
        location: 'Chennai, Tamil Nadu',
        coordinates: { latitude: 13.0827, longitude: 80.2707 },
        date: new Date('2024-11-01'),
        duration_hours: 3,
        participants_count: 25,
        topics_covered: ['Emergency communication', 'Alert systems', 'Social media for disaster management'],
        feedback_summary: 'Modern approach to disaster communication. Very informative.',
        status: 'pending'
      },
      {
        training_title: 'Landslide Risk Assessment',
        location: 'Shimla, Himachal Pradesh',
        coordinates: { latitude: 31.1048, longitude: 77.1734 },
        date: new Date('2024-11-05'),
        duration_hours: 6,
        participants_count: 20,
        topics_covered: ['Geological factors', 'Risk zones', 'Early warning signs', 'Mitigation measures'],
        feedback_summary: 'Critical training for hill states. Excellent field demonstrations.',
        status: 'approved'
      }
    ];

    // Create reports for different trainers
    let createdCount = 0;
    for (let i = 0; i < demoReports.length; i++) {
      const trainer = trainers[i % trainers.length]; // Rotate through trainers
      const reportData = {
        ...demoReports[i],
        trainer_id: trainer._id,
        trainer_name: trainer.name,
        organization: trainer.organization
      };

      const report = new Report(reportData);
      await report.save();
      createdCount++;
      console.log(`✅ Created: ${reportData.training_title} by ${reportData.trainer_name} (${reportData.organization})`);
    }

    console.log(`\n🎉 Successfully created ${createdCount} demo reports!`);
    
    // Summary
    const totalReports = await Report.countDocuments();
    const approvedReports = await Report.countDocuments({ status: 'approved' });
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    
    console.log('\n📊 Report Summary:');
    console.log(`   Total: ${totalReports}`);
    console.log(`   Approved: ${approvedReports}`);
    console.log(`   Pending: ${pendingReports}`);
    
    // List by organization
    console.log('\n📋 Reports by Organization:');
    const orgs = await Report.aggregate([
      { $group: { _id: '$organization', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    orgs.forEach(org => {
      console.log(`   ${org._id}: ${org.count} reports`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createDemoReports();
