const express = require('express');
const { 
    createPost, 
    getAllPosts, 
    getMyPosts, 
    getPost,
    likePost, 
    unlikePost, 
    commentOnPost,
    deleteComment,
    updateComment,
    likeComment,
    unlikeComment,
    deletePost,
    updatePost,
} = require('../controller/postController'); // Fixed: 'controller' -> 'controllers'
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth'); // Fixed: 'middlewares' (plural)
const {upload} = require('../middlewares/upload')

const router = express.Router();

// All routes require authentication except /all which is public
// Guides/admins can create & manage posts; tourists can only read
router.post('/create', isAuthenticated, authorizeRoles('guide', 'admin'), upload.single('photo'), createPost);


router.get('/all', getAllPosts);
router.get('/me', isAuthenticated, authorizeRoles('guide', 'admin'), getMyPosts);
router.get('/:postId', isAuthenticated, getPost);
router.put('/like/:postId', isAuthenticated, likePost);
router.put('/unlike/:postId', isAuthenticated, unlikePost);
router.put('/comment/:postId', isAuthenticated, commentOnPost);
router.put('/comment/:postId/:commentId', isAuthenticated, updateComment);
router.delete('/comment/:postId/:commentId', isAuthenticated, deleteComment);
router.put('/like-comment/:postId/:commentId', isAuthenticated, likeComment);
router.put('/unlike-comment/:postId/:commentId', isAuthenticated, unlikeComment);
router.put('/update/:postId', isAuthenticated, authorizeRoles('guide', 'admin'), upload.single('photo'), updatePost);
router.delete('/delete/:postId', isAuthenticated, authorizeRoles('guide', 'admin'), deletePost);

module.exports = router;
