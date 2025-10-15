# Quick Start Guide - NDMA Backend 🚀

## Step 1: Get MongoDB URI 📦

1. Go to https://www.mongodb.com/cloud/atlas/register
2. Sign up for FREE account
3. Create a FREE cluster (M0 Sandbox)
4. Click "Connect" → "Drivers"
5. Copy connection string
6. Replace `<password>` with your password
7. Paste in `.env` file as `MONGODB_URI`

Example:
```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/
```

## Step 2: Update Backend URL in App ⚙️

Find your PC's IP address:
```powershell
ipconfig
```

Look for "IPv4 Address" (usually starts with 192.168...)

Then update in `ProfileScreen.js`:
```javascript
const BACKEND_URL = 'http://YOUR_IP_HERE:5000';
```

Example:
```javascript
const BACKEND_URL = 'http://192.168.1.100:5000';
```

## Step 3: Start Backend 🎯

```bash
cd ndma-backend
npm run dev
```

You should see:
```
✅ Connected to MongoDB
🚀 NDMA Storage Backend running on port 5000
📦 Bucket: myimagesndma
```

## Step 4: Test Profile Picture Upload 📸

1. Start your React Native app: `npx expo start`
2. Go to Profile tab
3. Tap on profile picture
4. Select image from gallery
5. Wait for upload
6. Image should appear!

## Troubleshooting 🔧

### Error: MongoDB connection failed
- Check MONGODB_URI in `.env`
- Make sure password is correct
- Check internet connection

### Error: Network request failed (in app)
- Check backend is running
- Check BACKEND_URL has correct IP
- Make sure phone and PC are on same WiFi
- Try `http://` not `https://`

### Error: Upload failed
- Check GCP bucket permissions
- Verify service-account-key.json exists
- Check backend logs for details

## Testing with Browser 🌐

Open in browser to check backend:
```
http://localhost:5000/
```

Should show:
```json
{
  "status": "running",
  "service": "NDMA Storage Backend",
  "bucket": "myimagesndma",
  "publicBucket": true
}
```

## Next Steps 🎉

Once profile picture works:
- Upload CSV files to backend
- Upload training photos
- Fetch and display in app
- Store disaster zone images
- Share files between users

## Need Help? 💬

Check console logs:
- Backend: Terminal running `npm run dev`
- App: Metro bundler terminal
- Browser: Developer tools (F12)
