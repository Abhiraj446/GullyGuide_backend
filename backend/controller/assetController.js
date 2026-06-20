const Asset = require('../models/asset-Model');

// ============= CREATE ASSET (Guide only) =============
exports.createAsset = async (req, res) => {
    try {
        // Only guides can create assets
        if (req.user.role !== 'guide') {
            return res.status(403).json({
                success: false,
                message: 'Only guides can create assets',
            });
        }

        const { name, description, pricePerDay, quantityAvailable, type, images: bodyImages } = req.body;

        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            imageUrls = req.files.map((file) => file.path);
        }

        const finalImages = imageUrls.length > 0
            ? imageUrls
            : (Array.isArray(bodyImages) ? bodyImages : []);

        // Basic validation
        if (!name || pricePerDay === undefined || pricePerDay === null) {
            return res.status(400).json({
                success: false,
                message: 'Name and price per day are required',
            });
        }

        const asset = new Asset({
            guide: req.user._id,
            name: name.trim(),
            description: description?.trim() || '',
            pricePerDay: Number(pricePerDay),
            quantityAvailable: Number(quantityAvailable) || 1,
            type: type || 'other',
            images: finalImages,
        });

        await asset.save();

        res.status(201).json({
            success: true,
            message: 'Asset created successfully',
            asset,
        });
    } catch (error) {
        console.error('Create Asset Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
};

// ============= GET MY ASSETS (Guide's own assets) =============
exports.getMyAssets = async (req, res) => {
    try {
        const assets = await Asset.find({ guide: req.user._id }).sort('-createdAt');

        res.status(200).json({
            success: true,
            count: assets.length,
            assets,
        });
    } catch (error) {
        console.error('Get My Assets Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
};

// ============= GET ASSETS BY GUIDE (Public / Tourist view) =============
exports.getGuideAssets = async (req, res) => {
    try {
        const { guideId } = req.params;
        const { type } = req.query; // Optional filter by type

        if (!guideId) {
            return res.status(400).json({
                success: false,
                message: 'Guide ID is required',
            });
        }

        const filter = { guide: guideId };
        if (type) {
            filter.type = type;
        }

        const assets = await Asset.find(filter).sort('name');

        res.status(200).json({
            success: true,
            count: assets.length,
            assets,
        });
    } catch (error) {
        console.error('Get Guide Assets Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
};

// ============= UPDATE ASSET (Guide only) =============
exports.updateAsset = async (req, res) => {
    try {
        const { assetId } = req.params;
        const { name, description, pricePerDay, quantityAvailable, type, images } = req.body;

        // Find asset
        const asset = await Asset.findById(assetId);
        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found',
            });
        }

        // Check ownership
        if (asset.guide.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only update your own assets',
            });
        }

        // Build update object (only send fields that are provided)
        const updates = {};
        if (name) updates.name = name.trim();
        if (description !== undefined) updates.description = description?.trim() || '';
        if (pricePerDay !== undefined && pricePerDay !== null) updates.pricePerDay = Number(pricePerDay);
        if (quantityAvailable !== undefined && quantityAvailable !== null) updates.quantityAvailable = Number(quantityAvailable);
        if (type) updates.type = type;
        if (images) updates.images = Array.isArray(images) ? images : [];

        const updatedAsset = await Asset.findByIdAndUpdate(
            assetId,
            updates,
            { new: true, runValidators: true } // Return updated doc & run validators
        );

        res.status(200).json({
            success: true,
            message: 'Asset updated successfully',
            asset: updatedAsset,
        });
    } catch (error) {
        console.error('Update Asset Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
};

// ============= DELETE ASSET (Guide only) =============
exports.deleteAsset = async (req, res) => {
    try {
        const { assetId } = req.params;

        const asset = await Asset.findById(assetId);
        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found',
            });
        }

        // Check ownership
        if (asset.guide.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own assets',
            });
        }

        // Optional: Check if asset is currently used in any pending/confirmed booking
        // (We'll add this check later in Phase 3)
        // For now, just delete.

        await asset.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Asset deleted successfully',
        });
    } catch (error) {
        console.error('Delete Asset Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
};
