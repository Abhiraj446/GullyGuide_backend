const express = require('express');
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');
const { getAdminReports } = require('../controller/adminController');

const router = express.Router();

router.get('/reports', isAuthenticated, authorizeRoles('admin'), getAdminReports);

module.exports = router;
