import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Report from './models/Report.js';

dotenv.config();

async function createTestReport() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get a test user ID
    const User = mongoose.model('User', new mongoose.Schema({
      name: String,
      email: String
    }));
    
    const testUser = await User.findOne({ email: 'divyanshu@ndma.gov.in' });
    
    if (!testUser) {
      console.log('❌ Test user not found! Run create-production-users.js first');
      process.exit(1);
    }

    console.log('✅ Found user:', testUser.name, testUser._id);

    // Create a test report
    const testReport = new Report({
      userId: testUser._id,
      userEmail: testUser.email,
      userName: testUser.name,
      trainingType: 'Test Fire Safety Training',
      location: {
        name: 'Test Training Center, Delhi',
        latitude: 28.6139,
        longitude: 77.2090
      },
      date: new Date().toISOString().split('T')[0],
      participants: 50,
      duration: '3 hours',
      description: 'This is a test training report created to verify MongoDB connectivity and report saving functionality.',
      effectiveness: 'Excellent - All participants showed great understanding',
      photos: [
        'https://storage.googleapis.com/myimagesndma/test-photo-1.jpg',
        'https://storage.googleapis.com/myimagesndma/test-photo-2.jpg'
      ],
      documents: [
        {
          url: 'https://storage.googleapis.com/myimagesndma/test-doc.pdf',
          name: 'Test Document.pdf',
          type: 'application/pdf'
        }
      ]
    });

    console.log('💾 Saving test report...');
    await testReport.save();
    
    console.log('✅ Test report created successfully!');
    console.log('📋 Report Details:');
    console.log('   ID:', testReport._id);
    console.log('   User:', testReport.userName);
    console.log('   Type:', testReport.trainingType);
    console.log('   Location:', testReport.location.name);
    console.log('   Date:', testReport.date);
    console.log('   Participants:', testReport.participants);
    console.log('   Photos:', testReport.photos.length);
    console.log('   Documents:', testReport.documents.length);

    // Verify it's saved
    const count = await Report.countDocuments();
    console.log('\n📊 Total reports in database:', count);

    // Fetch the report to confirm
    const savedReport = await Report.findById(testReport._id);
    console.log('✅ Report verified in database:', savedReport ? 'YES' : 'NO');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

createTestReport();