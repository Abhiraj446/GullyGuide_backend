const cloudinary = require('cloudinary').v2;

// Cloudinary configuration using env variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify configuration
console.log('📸 Cloudinary Config Check:');
console.log('- Cloud Name:', process.env.CLOUDINARY_NAME || '❌ Missing');
console.log('- API Key:', process.env.CLOUDINARY_API_KEY ? '✅ Present' : '❌ Missing');
console.log('- API Secret:', process.env.CLOUDINARY_API_SECRET ? '✅ Present' : '❌ Missing');

if (!process.env.CLOUDINARY_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ ERROR: Cloudinary environment variables are missing!');
}

module.exports = cloudinary;