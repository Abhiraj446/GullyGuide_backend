// controllers/postController.js
const Post = require('../models/post');
const cloudinary = require('../config/cloudinary');

// CREATE POST WITH IMAGE UPLOAD
exports.createPost = async (req, res) => {

    try {
        const { title, body } = req.body;

        // Check required fields
        if (!title || !body) {
            return res.status(422).json({ error: "Title and body are required" });
        }

        // Check if file was uploaded
        if (!req.file) {
            return res.status(422).json({ error: "Photo is required" });
        }

        // Create new post with Cloudinary URL from multer
        const post = new Post({
            title,
            body,
            photo: req.file.path, // Cloudinary URL is in req.file.path
            postedBy: req.user._id
        });

        await post.save();
        
        // Populate user info for response
        const populatedPost = await Post.findById(post._id)
            .populate('postedBy', 'name email avatar');

        res.status(201).json({
            message: "Post created successfully",
            post: populatedPost
        });
    } catch (error) {
        console.error("Create post error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET ALL POSTS (with pagination)
exports.getAllPosts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const posts = await Post.find()
            .populate('postedBy', 'name email avatar')
            .populate('comments.commentedBy', 'name avatar')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);

        const totalPosts = await Post.countDocuments();

        res.json({ 
            posts,
            currentPage: page,
            totalPages: Math.ceil(totalPosts / limit),
            totalPosts
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET MY POSTS
exports.getMyPosts = async (req, res) => {
    try {
        const posts = await Post.find({ postedBy: req.user._id })
            .populate('postedBy', 'name email avatar')
            .populate('comments.commentedBy', 'name avatar')
            .sort('-createdAt');
        
        res.json({ posts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET SINGLE POST
exports.getPost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId)
            .populate('postedBy', 'name email avatar')
            .populate('comments.commentedBy', 'name avatar');

        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        res.json({ post });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// LIKE POST
exports.likePost = async (req, res) => {
    try {
        const post = await Post.findByIdAndUpdate(
            req.params.postId,
            { $addToSet: { likes: req.user._id } },
            { new: true }
        ).populate('postedBy', 'name email avatar')
         .populate('comments.commentedBy', 'name avatar');

        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        res.json({ message: "Post liked", post });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UNLIKE POST
exports.unlikePost = async (req, res) => {
    try {
        const post = await Post.findByIdAndUpdate(
            req.params.postId,
            { $pull: { likes: req.user._id } },
            { new: true }
        ).populate('postedBy', 'name email avatar')
         .populate('comments.commentedBy', 'name avatar');

        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        res.json({ message: "Post unliked", post });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// COMMENT ON POST
exports.commentOnPost = async (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.status(422).json({ error: "Comment text is required" });
    }

    try {
        const comment = {
            text,
            commentedBy: req.user._id
        };

        const post = await Post.findByIdAndUpdate(
            req.params.postId,
            { $push: { comments: comment } },
            { new: true }
        ).populate('postedBy', 'name email avatar')
         .populate('comments.commentedBy', 'name avatar');

        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        res.json({ message: "Comment added", post });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// DELETE POST (with Cloudinary image cleanup)
exports.deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Check ownership
        if (post.postedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "You can only delete your own posts" });
        }

        // Extract public_id from Cloudinary URL and delete image
        if (post.photo) {
            try {
                // More robust way to extract public_id from Cloudinary URL
                const urlParts = post.photo.split('/');
                // Find 'upload' in the URL to get the path after it
                const uploadIndex = urlParts.indexOf('upload');
                if (uploadIndex !== -1 && urlParts.length > uploadIndex + 1) {
                    // Get everything after 'upload'
                    const publicIdParts = urlParts.slice(uploadIndex + 1);
                    // Remove version number if present (starts with 'v' followed by numbers)
                    const filteredParts = publicIdParts.filter(part => !/^v\d+$/.test(part));
                    // Join and remove file extension
                    const publicIdWithExt = filteredParts.join('/');
                    const publicId = publicIdWithExt.split('.')[0];
                    
                    await cloudinary.uploader.destroy(publicId);
                    console.log('Image deleted from Cloudinary:', publicId);
                }
            } catch (cloudinaryError) {
                console.error('Error deleting image from Cloudinary:', cloudinaryError);
                // Continue with post deletion even if image delete fails
            }
        }

        // Delete post from database
        await Post.deleteOne({ _id: req.params.postId });
        
        res.json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UPDATE POST (with optional new image)
exports.updatePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Check ownership
        if (post.postedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "You can only update your own posts" });
        }

        const updates = {};
        if (req.body.title) updates.title = req.body.title;
        if (req.body.body) updates.body = req.body.body;
        
        // If new image uploaded
        if (req.file) {
            // Delete old image from Cloudinary
            if (post.photo) {
                try {
                    // More robust way to extract public_id from Cloudinary URL
                    const urlParts = post.photo.split('/');
                    const uploadIndex = urlParts.indexOf('upload');
                    if (uploadIndex !== -1 && urlParts.length > uploadIndex + 1) {
                        const publicIdParts = urlParts.slice(uploadIndex + 1);
                        const filteredParts = publicIdParts.filter(part => !/^v\d+$/.test(part));
                        const publicIdWithExt = filteredParts.join('/');
                        const publicId = publicIdWithExt.split('.')[0];
                        await cloudinary.uploader.destroy(publicId);
                        console.log('Old image deleted from Cloudinary:', publicId);
                    }
                } catch (error) {
                    console.error('Error deleting old image:', error);
                }
            }
            updates.photo = req.file.path;
        }

        const updatedPost = await Post.findByIdAndUpdate(
            req.params.postId,
            updates,
            { new: true }
        ).populate('postedBy', 'name email avatar')
         .populate('comments.commentedBy', 'name avatar');

        res.json({ 
            message: "Post updated successfully",
            post: updatedPost 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};
