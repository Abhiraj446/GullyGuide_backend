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
const { isAuthenticated } = require('../middlewares/auth'); // Fixed: 'middlewares' (plural)
const {upload} = require('../middlewares/upload')

const router = express.Router();

// All routes require authentication
router.post('/create', isAuthenticated, upload.single('photo'), createPost);
router.get('/all', isAuthenticated, getAllPosts);
router.get('/me', isAuthenticated, getMyPosts);
router.get('/:postId', isAuthenticated, getPost);
router.put('/like/:postId', isAuthenticated, likePost);
router.put('/unlike/:postId', isAuthenticated, unlikePost);
router.put('/comment/:postId', isAuthenticated, commentOnPost);
router.put('/update/:postId', isAuthenticated, upload.single('photo'), updatePost);
router.delete('/delete/:postId', isAuthenticated, deletePost);

module.exports = router;