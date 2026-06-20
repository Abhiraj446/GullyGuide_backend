const express = require('express');
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');
const {
    createTemplate,
    getMyTemplates,
    getGuideTemplates,
    updateTemplate,
    deleteTemplate,
} = require('../controller/packageTemplateController');

const router = express.Router();

router.post('/', isAuthenticated, authorizeRoles('guide'), createTemplate);
router.get('/my', isAuthenticated, authorizeRoles('guide'), getMyTemplates);
router.get('/guide/:guideId', isAuthenticated, getGuideTemplates);
router.put('/:id', isAuthenticated, authorizeRoles('guide'), updateTemplate);
router.delete('/:id', isAuthenticated, authorizeRoles('guide'), deleteTemplate);

module.exports = router;
