const express = require('express');
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');
const {
    generateFinalBill,
    getBill,
    listBills,
} = require('../controller/finalBillController');

const router = express.Router();

router.post('/booking/:bookingId', isAuthenticated, authorizeRoles('guide'), generateFinalBill);
router.get('/my', isAuthenticated, authorizeRoles('guide'), listBills);
router.get('/:id', isAuthenticated, getBill);

module.exports = router;
