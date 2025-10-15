/**
 * Mini Upload Server - Signed URL Generator for GCS
 * Generates signed URLs for direct GCS uploads
 * Updated bucket: newimagesndma
 * Run: node upload-server.js
 */

import express from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json()); // Parse JSON bodies

const PORT = 5000;

// GCS Storage setup with NEW bucket
const storage = new Storage({
  keyFilename: './service-account-key.json',
});

const bucket = storage.bucket('newimagesndma'); // ✅ Updated bucket name

// Multer for memory storage (for fallback upload endpoint)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: 'GCS Signed URL Server',
    bucket: 'newimagesndma'
  });
});

// ✅ NEW: Generate signed URL endpoint
app.post('/get-signed-url', async (req, res) => {
  try {
    const { fileName, contentType = 'image/jpeg' } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const file = bucket.file(fileName);

    // Generate signed URL valid for 15 minutes
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType,
    });

    console.log(`✅ Generated signed URL for: ${fileName}`);

    res.json({ 
      signedUrl,
      fileName,
      publicUrl: `https://storage.googleapis.com/newimagesndma/${fileName}`
    });
  } catch (error) {
    console.error('❌ Error generating signed URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback: Simple upload endpoint (old method)
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folder = req.body.folder || 'uploads';
    const timestamp = Date.now();
    const fileName = `${folder}/${timestamp}_${req.file.originalname}`;

    const file = bucket.file(fileName);

    // Upload to GCS
    await file.save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    // Make public
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/newimagesndma/${fileName}`;

    console.log('✅ Uploaded:', fileName);
    
    res.json({ 
      success: true,
      url: publicUrl,
      fileName 
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Mini GCS Upload Server running on port ${PORT}`);
  console.log(`📦 Bucket: myimagesndma`);
  console.log(`\nEndpoint: POST http://localhost:${PORT}/upload\n`);
});
