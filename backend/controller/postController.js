// controllers/postController.js
const Post = require('../models/post');
const cloudinary = require('../config/cloudinary');
const { sendNotification, NotificationTemplates } = require('../utils/notificationHelper');

const parseJSON = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeLocation = (body = {}, fallbackLocation = {}) => {
  const rawLocation = parseJSON(body.location);

  if (rawLocation && typeof rawLocation === 'object') {
    return rawLocation;
  }

  const nestedLocation = body.location && typeof body.location === 'object' ? body.location : {};
  const bracketLocation = {
    city: body['location[city]'],
    state: body['location[state]'],
    coordinates: {
      lat: body['location[coordinates][lat]'],
      lng: body['location[coordinates][lng]'],
    },
  };

  const stringLocation = typeof rawLocation === 'string'
    ? rawLocation.split(',').map((part) => part.trim()).filter(Boolean)
    : [];

  const candidate = {
    city: nestedLocation.city || bracketLocation.city || stringLocation[0] || fallbackLocation.city,
    state: nestedLocation.state || bracketLocation.state || stringLocation[1] || fallbackLocation.state,
    coordinates: nestedLocation.coordinates || bracketLocation.coordinates || fallbackLocation.coordinates,
  };

  if (candidate.coordinates) {
    const lat = Number(candidate.coordinates.lat);
    const lng = Number(candidate.coordinates.lng);
    candidate.coordinates = {
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    };
  }

  return candidate;
};

const defaultPackages = [
  { name: 'Standard', multiplier: 1.0 },
  { name: 'Medium', multiplier: 1.5 },
  { name: 'Premium', multiplier: 3.0 },
];

const normalizeGroupDiscounts = (value) => {
  const parsed = parseJSON(value);
  if (parsed === undefined || parsed === null || parsed === '') return undefined;
  if (!Array.isArray(parsed)) {
    throw new Error('groupDiscounts must be an array');
  }

  return parsed.map((item) => {
    const minPeople = Number(item.minPeople);
    const discountPercent = Number(item.discountPercent);

    if (!Number.isInteger(minPeople) || minPeople < 1) {
      throw new Error('groupDiscounts minPeople must be a positive integer');
    }

    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      throw new Error('groupDiscounts discountPercent must be between 0 and 100');
    }

    return { minPeople, discountPercent };
  }).sort((a, b) => a.minPeople - b.minPeople);
};

// CREATE POST WITH IMAGE UPLOAD
exports.createPost = async (req, res) => {

    try {
        // Only guides can create posts
        if (req.user?.role !== 'guide') {
            return res.status(403).json({ error: "Only guides can create posts" });
        }

        const { title, body, price } = req.body;
        const normalizedPrice = Number(price);

        // Check required fields
        if (!title || !body) {
            return res.status(422).json({ error: "Title and body are required" });
        }

        if (price === undefined || price === null || price === '' || Number.isNaN(normalizedPrice) || normalizedPrice < 0) {
            return res.status(422).json({ error: "Valid price is required" });
        }

        // Check if file was uploaded
        if (!req.file) {
            return res.status(422).json({ error: "Photo is required" });
        }

        const userLocation = req.user?.location || {};
        const requestLocation = normalizeLocation(req.body, userLocation);
        const locationSource = (requestLocation && requestLocation.city && requestLocation.state)
            ? requestLocation
            : null;

        if (!locationSource || !locationSource.city || !locationSource.state) {
            return res.status(422).json({ error: "Location city and state are required" });
        }

        let groupDiscounts;
        try {
            groupDiscounts = normalizeGroupDiscounts(req.body.groupDiscounts);
        } catch (error) {
            return res.status(422).json({ error: error.message });
        }

        const postData = {
            title,
            body,
            price: normalizedPrice,
            photo: req.file.path, // Cloudinary URL is in req.file.path
            postedBy: req.user._id,
            location: {
                city: locationSource.city,
                state: locationSource.state,
                coordinates: locationSource.coordinates || userLocation.coordinates
            }
        };

        if (groupDiscounts !== undefined) postData.groupDiscounts = groupDiscounts;

        const post = new Post(postData);

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


// GET MY POSTS
exports.getAllPosts = async (req, res) => {
  try {
    // Get query params
    const { city, state } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    let filter = {};

    if (city) {
      filter["location.city"] = {
        $regex: new RegExp(`^${city}$`, "i"),
      };
    }

    if (state) {
      filter["location.state"] = {
        $regex: new RegExp(`^${state}$`, "i"),
      };
    }

    // Get total posts count
    const totalPosts = await Post.countDocuments(filter);

    // Apply filter + pagination
    const posts = await Post.find(filter)
      .populate("postedBy", "name email avatar")
      .sort({ createdAt: -1 })
      .skip(skip)      // pagination start
      .limit(limit);   // max records per page

    // Format posts
    const formattedPosts = posts.map((post) => ({
      _id: post._id,
      title: post.title,
      body: post.body,
      price: post.price,
      photo: post.photo,
      likes: post.likes,
      comments: post.comments,
      createdAt: post.createdAt,
      postedBy: post.postedBy,
      location: {
        city: post.location?.city?.trim().toUpperCase(),
        state: post.location?.state?.trim().toUpperCase(),
        coordinates: post.location?.coordinates,
      },
    }));

    res.status(200).json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      count: formattedPosts.length,
      filters: {
        city: city || null,
        state: state || null,
      },
      posts: formattedPosts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

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

exports.getPostPackages = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId).select('title price packages');

        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const packages = Array.isArray(post.packages) && post.packages.length
            ? post.packages
            : defaultPackages;

        res.json({
            success: true,
            postId: post._id,
            basePrice: post.price,
            packages
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// LIKE POST
exports.likePost = async (req, res) => {
    try {
        const existingPost = await Post.findById(req.params.postId);
        if (!existingPost) {
            return res.status(404).json({ error: "Post not found" });
        }

        const alreadyLiked = existingPost.likes.some(
            (likeId) => likeId.toString() === req.user._id.toString()
        );

        const post = await Post.findByIdAndUpdate(
            req.params.postId,
            { $addToSet: { likes: req.user._id } },
            { returnDocument: 'after' }
        ).populate('postedBy', 'name email avatar')
         .populate('comments.commentedBy', 'name avatar');

        if (!alreadyLiked) {
            const postOwnerId = post.postedBy?._id || post.postedBy;

            if (postOwnerId && postOwnerId.toString() !== req.user._id.toString()) {
                const likeNotification = NotificationTemplates.postLiked(req.user.name);

                await sendNotification(
                    postOwnerId,
                    req.user._id,
                    'like',
                    likeNotification.title,
                    likeNotification.message,
                    post._id,
                    'Post'
                );
            }
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
            { returnDocument: 'after' }
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
            { returnDocument: 'after' }
        ).populate('postedBy', 'name email avatar')
         .populate('comments.commentedBy', 'name avatar');

        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const postOwnerId = post.postedBy?._id || post.postedBy;
        if (postOwnerId && postOwnerId.toString() !== req.user._id.toString()) {
            const commentNotification = NotificationTemplates.postCommented(req.user.name);

            await sendNotification(
                postOwnerId,
                req.user._id,
                'comment',
                commentNotification.title,
                commentNotification.message,
                post._id,
                'Post'
            );
        }

        res.json({ message: "Comment added", post });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// DELETE COMMENT
exports.deleteComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;

        // Find the post
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Find the comment
        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        // Check if user is the commenter or admin
        if (comment.commentedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You can only delete your own comments" });
        }

        // Remove the comment
        post.comments.pull(commentId);
        await post.save();

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('postedBy', 'name email avatar')
            .populate('comments.commentedBy', 'name avatar');

        res.json({ message: "Comment deleted", post: updatedPost });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UPDATE COMMENT
exports.updateComment = async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(422).json({ error: "Comment text is required" });
    }

    try {
        const { postId, commentId } = req.params;

        // Find the post
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Find the comment
        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        // Check if user is the commenter or admin
        if (comment.commentedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You can only update your own comments" });
        }

        // Update the comment text
        comment.text = text;
        await post.save();

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('postedBy', 'name email avatar')
            .populate('comments.commentedBy', 'name avatar');

        res.json({ message: "Comment updated", post: updatedPost });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// LIKE COMMENT
exports.likeComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;

        // Find the post
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Find the comment
        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        // Add like if not already liked
        if (!comment.likes.includes(req.user._id)) {
            comment.likes.push(req.user._id);
            await post.save();
        }

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('postedBy', 'name email avatar')
            .populate('comments.commentedBy', 'name avatar');

        res.json({ message: "Comment liked", post: updatedPost });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UNLIKE COMMENT
exports.unlikeComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;

        // Find the post
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Find the comment
        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        // Remove like
        comment.likes = comment.likes.filter(id => id.toString() !== req.user._id.toString());
        await post.save();

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('postedBy', 'name email avatar')
            .populate('comments.commentedBy', 'name avatar');

        res.json({ message: "Comment unliked", post: updatedPost });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// DELETE POST (with Cloudinary image cleanup)
exports.deletePost = async (req, res) => {
    try {
        if (!['guide', 'admin'].includes(req.user?.role)) {
            return res.status(403).json({ error: "Only guides can delete posts" });
        }

        const post = await Post.findById(req.params.postId);
        
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Check ownership; admins may moderate unsafe posts.
        if (post.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
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
        if (req.body.price !== undefined) {
            const normalizedPrice = Number(req.body.price);
            if (req.body.price === '' || Number.isNaN(normalizedPrice) || normalizedPrice < 0) {
                return res.status(422).json({ error: "Valid price is required" });
            }
            updates.price = normalizedPrice;
        }
        if (req.body.groupDiscounts !== undefined) {
            try {
                updates.groupDiscounts = normalizeGroupDiscounts(req.body.groupDiscounts);
            } catch (error) {
                return res.status(422).json({ error: error.message });
            }
        }

        const requestLocation = normalizeLocation(req.body, post.location || req.user?.location || {});
        if (requestLocation && requestLocation.city && requestLocation.state) {
            updates.location = requestLocation;
        }
        
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
            { returnDocument: 'after' }
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
