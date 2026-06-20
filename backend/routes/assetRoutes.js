const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/auth');
const { uploadMultiple } = require('../middlewares/upload');
const {
    createAsset,
    getMyAssets,
    getGuideAssets,
    updateAsset,
    deleteAsset,
} = require('../controller/assetController');

// ============= PROTECTED ROUTES (Guide only) =============
// Create asset
router.post('/', isAuthenticated, uploadMultiple('images', 5), createAsset);

// Get logged-in guide's own assets
router.get('/my', isAuthenticated, getMyAssets);

// Update asset
router.put('/:assetId', isAuthenticated, updateAsset);

// Delete asset
router.delete('/:assetId', isAuthenticated, deleteAsset);

// ============= PUBLIC / SEMI-PUBLIC ROUTES =============
// Get assets by any guide (tourist can view)
router.get('/guide/:guideId', getGuideAssets); // No auth required, or you can add isAuthenticatedUser if needed

module.exports = router;
