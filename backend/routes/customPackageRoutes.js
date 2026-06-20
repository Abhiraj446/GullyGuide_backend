const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/auth');
const {
    estimatePackage,
    savePackage,
    getMyPackages,
    getPackageDetails,
    deletePackage,
} = require('../controller/customPackageController');

// ============= ALL ROUTES ARE PROTECTED (Tourist/Guide) =============

// 1. Estimate price (doesn't save) – Tourist only
router.post('/estimate', isAuthenticated, estimatePackage);

// 2. Save package with price lock – Tourist only
router.post('/save', isAuthenticated, savePackage);

// 3. Get logged-in tourist's packages
router.get('/my', isAuthenticated, getMyPackages);

// 4. Get single package details (tourist/guide/admin)
router.get('/:packageId', isAuthenticated, getPackageDetails);

// 5. Delete draft/expired package – Tourist only
router.delete('/:packageId', isAuthenticated, deletePackage);

module.exports = router;