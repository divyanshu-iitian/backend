# NDMA Storage Backend 🚀

Backend server for NDMA Training App with Google Cloud Storage integration.

## Features ✨
- ✅ Upload images, CSV, PDF, and any file type
- ✅ Profile picture management
- ✅ Public or private file access
- ✅ MongoDB for metadata storage
- ✅ Google Cloud Storage for file storage
- ✅ RESTful API

## Setup Instructions 🛠️

### 1. Install Dependencies
```bash
cd ndma-backend
npm install
```

### 2. Configure Environment Variables
Edit `.env` file:
```env
PORT=5000
MONGODB_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/
BUCKET_NAME=myimagesndma
PUBLIC_BUCKET=true
SIGNED_URL_EXPIRATION_MIN=60
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
```

**Get MongoDB URI:**
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free cluster
3. Get connection string
4. Replace in .env file

### 3. Verify Service Account Key
Make sure `service-account-key.json` exists in the folder.
- ✅ Already copied from parent directory
- Bucket: `myimagesndma`
- Service Account: `storage-provider@axiomatic-skill-473605-i3.iam.gserviceaccount.com`

### 4. Start Server
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will run on: http://localhost:5000

## API Endpoints 📡

### Upload File
```bash
POST http://localhost:5000/upload
Content-Type: multipart/form-data

Body:
- file: [your file]
- owner: "user123" (optional)
- folder: "general" (optional)
```

### Upload Profile Picture
```bash
POST http://localhost:5000/upload-profile
Content-Type: multipart/form-data

Body:
- profilePic: [image file]
- userId: "user123" (required)
```

### Get Profile Picture
```bash
GET http://localhost:5000/profile/:userId
```

### List Files
```bash
GET http://localhost:5000/files?limit=50&skip=0&fileType=image&owner=user123
```

### Get File Details
```bash
GET http://localhost:5000/files/:fileId
```

### Delete File
```bash
DELETE http://localhost:5000/files/:fileId
```

## File Types Supported 📁
- **Images**: jpg, png, gif, webp, etc
- **CSV**: text/csv, application/csv
- **PDF**: application/pdf
- **Others**: any file type

## Testing with cURL 🧪

### Upload Image
```bash
curl -X POST http://localhost:5000/upload \
  -F "file=@path/to/image.jpg" \
  -F "owner=user123" \
  -F "folder=images"
```

### Upload Profile Picture
```bash
curl -X POST http://localhost:5000/upload-profile \
  -F "profilePic=@path/to/profile.jpg" \
  -F "userId=user123"
```

### Get Profile Picture
```bash
curl http://localhost:5000/profile/user123
```

## Folder Structure 📂
```
ndma-backend/
├── server.js                  # Main server file
├── package.json              # Dependencies
├── .env                      # Environment variables
├── service-account-key.json  # GCP credentials
└── README.md                 # This file
```

## GCS Bucket Structure 🗂️
```
myimagesndma/
├── general/           # General uploads
├── images/            # Image uploads
├── csv/               # CSV files
├── profiles/          # Profile pictures
│   └── user123/      # User-specific folder
└── documents/         # Documents (PDF, etc)
```

## Error Handling ⚠️
- All errors return JSON with `error` and `details` fields
- 400: Bad request (missing file/params)
- 404: File not found
- 500: Server error

## Security 🔒
- File size limit: 20MB
- Only images allowed for profile pictures
- Optional owner/userId for file access control
- Public or private bucket modes

## Next Steps 🎯
1. Get MongoDB URI from MongoDB Atlas
2. Update .env file
3. Run `npm install`
4. Run `npm run dev`
5. Test with cURL or Postman
6. Integrate with React Native app

## Support 💬
If you face any issues:
1. Check MongoDB connection
2. Verify GCS bucket name
3. Check service account permissions
4. Look at console logs for errors
