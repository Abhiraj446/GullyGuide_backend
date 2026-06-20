  const multer = require('multer');
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  const cloudinary = require('../config/cloudinary');

  // Check if cloudinary is configured
  if (!cloudinary.config().cloud_name) {
    console.error('❌ ERROR: Cloudinary not configured properly in upload middleware');
  }

  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'GullyGuide/posts',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
    },
  });

  const assetStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'GullyGuide/assets',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
    },
  });

  // Storage for user avatars
  const avatarStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'GullyGuide/avatars',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 500, height: 500, crop: 'limit' }], // Smaller for avatars
    },
  });

    // Separate storage for avatars
  const uploadAvatar = multer({ 
    storage: avatarStorage,
    limits: {
      fileSize: 2 * 1024 * 1024, // 2MB for avatars
    },
    fileFilter: (req, file, cb) => {
      console.log('📁 Avatar file received:', file.originalname, 'Type:', file.mimetype);
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'), false);
      }
    }
  });



  const upload = multer({ 
    storage: storage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
      console.log('📁 File received:', file.originalname, 'Type:', file.mimetype);
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'), false);
      }
    }
  });

  const uploadAsset = multer({
    storage: assetStorage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
      console.log('ðŸ“ Asset file received:', file.originalname, 'Type:', file.mimetype);
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'), false);
      }
    }
  });

  const uploadMultiple = (fieldName, maxCount = 5) => uploadAsset.array(fieldName, maxCount);
  const uploadSingle = (fieldName) => uploadAsset.single(fieldName);

  module.exports = { upload, uploadAvatar, uploadMultiple, uploadSingle };
