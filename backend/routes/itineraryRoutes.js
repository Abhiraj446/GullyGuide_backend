const express = require('express');
const {
    createItinerary,
    addToItinerary,
    getMyItineraries,
    getItinerary,
    updateActivity,
    removeActivity,
    reorderActivities,
    deleteItinerary,
    shareItinerary,
    getSharedItinerary,
    exportAsPDF
} = require('../controller/itineraryController');
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Public route for shared itineraries
router.get('/shared/:shareCode', getSharedItinerary);

// Authenticated routes (Tourists only)
router.use(isAuthenticated, authorizeRoles('tourist'));

router.post('/create', createItinerary);
router.post('/:itineraryId/add', addToItinerary);
router.get('/', getMyItineraries);
router.get('/:itineraryId', getItinerary);
router.put('/:itineraryId/activity/:activityId', updateActivity);
router.delete('/:itineraryId/activity/:activityId', removeActivity);
router.put('/:itineraryId/reorder', reorderActivities);
router.delete('/:itineraryId', deleteItinerary);
router.post('/:itineraryId/share', shareItinerary);
router.get('/:itineraryId/export', exportAsPDF);

module.exports = router;
