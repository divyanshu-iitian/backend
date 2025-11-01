// Fix users with null email by generating unique emails
import mongoose from 'mongoose';

// User schema
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function fixNullEmails() {
  try {
    await mongoose.connect('mongodb+srv://divyanshumishra0208_db_user:1l3BoCM6C74G0NPr@cluster0.jsbvffu.mongodb.net/ndma_auth_db?retryWrites=true&w=majority&appName=Cluster0');
    console.log('✅ Connected to MongoDB');

    // Find all users with null email
    const nullEmailUsers = await User.find({ email: null });
    console.log(`📊 Found ${nullEmailUsers.length} users with null email`);

    if (nullEmailUsers.length === 0) {
      console.log('✅ No users with null email found');
      mongoose.connection.close();
      return;
    }

    // Fix each user
    for (const user of nullEmailUsers) {
      if (user.phone) {
        const newEmail = `trainee${user.phone}@ndma.temp`;
        user.email = newEmail;
        await user.save();
        console.log(`✅ Fixed user: ${user.phone} -> ${newEmail}`);
      } else {
        // If no phone, generate random email
        const randomId = Date.now() + Math.floor(Math.random() * 1000);
        user.email = `user${randomId}@ndma.temp`;
        await user.save();
        console.log(`✅ Fixed user without phone: ${user.name || user._id} -> ${user.email}`);
      }
    }

    console.log('✅ All users fixed!');
    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    mongoose.connection.close();
  }
}

fixNullEmails();
