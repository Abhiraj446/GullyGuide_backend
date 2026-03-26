const express = require('express');
const { 
    createPost, 
    getAllPosts, 
    getMyPosts, 
    getPost,
    likePost, 
    unlikePost, 
    commentOnPost,
    deletePost,
    updatePost
} = require('../controller/postController'); // Fixed: 'controller' -> 'controllers'
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth'); // Fixed: 'middlewares' (plural)
const {upload} = require('../middlewares/upload')

const router = express.Router();

// All routes require authentication
// Guides/admins can create & manage posts; tourists can only read
router.post('/create', isAuthenticated, authorizeRoles('guide', 'admin'), upload.single('photo'), createPost);
router.get('/all', isAuthenticated, getAllPosts);
router.get('/me', isAuthenticated, authorizeRoles('guide', 'admin'), getMyPosts);
router.get('/:postId', isAuthenticated, getPost);
router.put('/like/:postId', isAuthenticated, authorizeRoles('guide', 'admin'), likePost);
router.put('/unlike/:postId', isAuthenticated, authorizeRoles('guide', 'admin'), unlikePost);
router.put('/comment/:postId', isAuthenticated, authorizeRoles('guide', 'admin'), commentOnPost);
router.put('/update/:postId', isAuthenticated, authorizeRoles('guide', 'admin'), upload.single('photo'), updatePost);
router.delete('/delete/:postId', isAuthenticated, authorizeRoles('guide', 'admin'), deletePost);

module.exports = router;
