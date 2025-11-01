import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Report from './models/Report.js';

dotenv.config();

async function checkReports() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const count = await Report.countDocuments();
    console.log('📊 Total reports in database:', count);

    if (count > 0) {
      const reports = await Report.find().limit(5).sort({ createdAt: -1 });
      console.log('📋 Recent reports:');
      reports.forEach((report, index) => {
        console.log(`${index + 1}. ID: ${report._id}`);
        console.log(`   User: ${report.userName} (${report.userEmail})`);
        console.log(`   Training: ${report.trainingType}`);
        console.log(`   Location: ${report.location?.name || 'N/A'}`);
        console.log(`   Photos: ${report.photos?.length || 0}`);
        console.log(`   Created: ${report.createdAt}`);
        console.log('---');
      });
    } else {
      console.log('❌ No reports found in database');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkReports();