const CustomPackage = require('../models/customPackage-Model');
const Post = require('../models/post');
const Asset = require('../models/asset-Model');

const defaultGroupDiscounts = [
    { minPeople: 5, discountPercent: 10 },
    { minPeople: 8, discountPercent: 15 },
    { minPeople: 10, discountPercent: 20 },
];

const getGroupDiscount = (postDiscounts, numberOfPeople) => {
    const discounts = Array.isArray(postDiscounts) && postDiscounts.length
        ? postDiscounts
        : defaultGroupDiscounts;

    return discounts
        .filter((discount) => Number(numberOfPeople) >= Number(discount.minPeople))
        .sort((a, b) => Number(b.minPeople) - Number(a.minPeople))[0]?.discountPercent || 0;
};

// ============= HELPER: Calculate Estimate =============
const calculateEstimate = async (postId, selectedAssets, numberOfPeople, startDate, endDate) => {
    // 1. Fetch post
    const post = await Post.findById(postId);
    if (!post) {
        throw new Error('Post not found');
    }

    const basePrice = Number(post.price);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
        throw new Error('Invalid base price in post');
    }
    // 2. Calculate days
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.max(1, Math.floor((new Date(endDate) - new Date(startDate)) / msPerDay) + 1);

    // 3. Calculate base total (before discount)
    let baseTotal = basePrice * numberOfPeople * days;

    // 4. Fetch assets and calculate asset totals
    let assetTotal = 0;
    const assetDetails = [];

    if (selectedAssets && selectedAssets.length > 0) {
        const assetIds = selectedAssets.map(item => item.assetId);
        const assets = await Asset.find({ _id: { $in: assetIds } });

        // Create a map for quick lookup
        const assetMap = {};
        assets.forEach(asset => {
            assetMap[asset._id.toString()] = asset;
        });

        for (const item of selectedAssets) {
            const asset = assetMap[item.assetId];
            if (!asset) {
                throw new Error(`Asset with ID ${item.assetId} not found`);
            }

            // Check if quantity is available
            if (item.quantity > asset.quantityAvailable) {
                throw new Error(`Only ${asset.quantityAvailable} units of "${asset.name}" available`);
            }

            const pricePerDay = Number(asset.pricePerDay);
            const total = pricePerDay * item.quantity * days;
            assetTotal += total;

            assetDetails.push({
                assetId: asset._id,
                quantity: item.quantity,
                pricePerDay: pricePerDay,
                totalPrice: total,
            });
        }
    }

    // 5. Apply guide-configured group discount (on base price only)
    const discount = getGroupDiscount(post.groupDiscounts, numberOfPeople);

    const discountedBase = baseTotal * (1 - discount / 100);

    // 6. Final total
    const totalEstimate = discountedBase + assetTotal;

    return {
        post,
        basePrice,
        days,
        baseTotal,
        assetDetails,
        assetTotal,
        discount,
        discountedBase,
        totalEstimate,
        numberOfPeople,
        startDate,
        endDate,
    };
};

// ============= 1. ESTIMATE API (Does NOT save) =============
exports.estimatePackage = async (req, res) => {
    try {
        if (req.user.role !== 'tourist') {
            return res.status(403).json({
                success: false,
                message: 'Only tourists can estimate packages',
            });
        }

        const { postId, selectedAssets, numberOfPeople, startDate, endDate } = req.body;

        // Basic validation
        if (!postId || !numberOfPeople || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'postId, numberOfPeople, startDate, and endDate are required',
            });
        }

        const estimateData = await calculateEstimate(
            postId,
            selectedAssets || [],
            numberOfPeople,
            startDate,
            endDate
        );

        res.status(200).json({
            success: true,
            message: 'Estimate calculated successfully',
            estimate: {
                post: estimateData.post,
                basePrice: estimateData.basePrice,
                days: estimateData.days,
                numberOfPeople: estimateData.numberOfPeople,
                baseTotal: estimateData.baseTotal,
                assetDetails: estimateData.assetDetails,
                assetTotal: estimateData.assetTotal,
                discount: estimateData.discount,
                discountedBase: estimateData.discountedBase,
                totalEstimate: estimateData.totalEstimate,
                startDate: estimateData.startDate,
                endDate: estimateData.endDate,
            },
        });
    } catch (error) {
        console.error('Estimate Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error',
        });
    }
};

// ============= 2. SAVE PACKAGE API (Creates CustomPackage with price lock) =============
exports.savePackage = async (req, res) => {
    try {
        if (req.user.role !== 'tourist') {
            return res.status(403).json({
                success: false,
                message: 'Only tourists can save packages',
            });
        }

        const { postId, selectedAssets, numberOfPeople, startDate, endDate } = req.body;

        if (!postId || !numberOfPeople || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'postId, numberOfPeople, startDate, and endDate are required',
            });
        }

        // Calculate estimate
        const estimateData = await calculateEstimate(
            postId,
            selectedAssets || [],
            numberOfPeople,
            startDate,
            endDate
        );

        const guideId = estimateData.post.postedBy;
        
        // Prepare selectedAssets for saving (snapshot)
        const savedAssets = estimateData.assetDetails.map(asset => ({
            assetId: asset.assetId,
            quantity: asset.quantity,
            pricePerDay: asset.pricePerDay,
            totalPrice: asset.totalPrice,
        }));

        // Create package with price lock (1 hour expiry)
        const customPackage = new CustomPackage({
            tourist: req.user._id,
            guide: guideId,
            post: postId,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            numberOfPeople: numberOfPeople,
            selectedAssets: savedAssets,
            basePrice: estimateData.basePrice,
            groupDiscount: estimateData.discount,
            totalEstimate: estimateData.totalEstimate,
            status: 'draft',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour price lock
        });

        await customPackage.save();

        // Populate for response
        const populatedPackage = await CustomPackage.findById(customPackage._id)
            .populate('tourist', 'name email')
            .populate('guide', 'name email')
            .populate('post', 'title price')
            .populate('selectedAssets.assetId', 'name type');

        res.status(201).json({
            success: true,
            message: 'Custom package saved with 1-hour price lock',
            customPackage: populatedPackage,
        });
    } catch (error) {
        console.error('Save Package Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error',
        });
    }
};

// ============= 3. GET MY PACKAGES (Tourist) =============
exports.getMyPackages = async (req, res) => {
    try {
        const packages = await CustomPackage.find({ tourist: req.user._id })
            .populate('guide', 'name avatar')
            .populate('post', 'title photo')
            .populate('selectedAssets.assetId', 'name type')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: packages.length,
            packages,
        });
    } catch (error) {
        console.error('Get My Packages Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// ============= 4. GET SINGLE PACKAGE =============
exports.getPackageDetails = async (req, res) => {
    try {
        const { packageId } = req.params;

        const customPackage = await CustomPackage.findById(packageId)
            .populate('tourist', 'name email avatar')
            .populate('guide', 'name email avatar phone')
            .populate('post', 'title price location body photo')
            .populate('selectedAssets.assetId', 'name type images');

        if (!customPackage) {
            return res.status(404).json({
                success: false,
                message: 'Custom package not found',
            });
        }

        // Check authorization: tourist or guide or admin
        const isAuthorized =
            customPackage.tourist._id.toString() === req.user._id.toString() ||
            customPackage.guide._id.toString() === req.user._id.toString() ||
            req.user.role === 'admin';

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this package',
            });
        }

        res.status(200).json({
            success: true,
            customPackage,
        });
    } catch (error) {
        console.error('Get Package Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};

// ============= 5. DELETE PACKAGE (Only if status = draft or expired) =============
exports.deletePackage = async (req, res) => {
    try {
        const { packageId } = req.params;

        const customPackage = await CustomPackage.findById(packageId);

        if (!customPackage) {
            return res.status(404).json({
                success: false,
                message: 'Custom package not found',
            });
        }

        // Check ownership
        if (customPackage.tourist.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own packages',
            });
        }

        // Only allow deletion of draft or expired packages (not booked)
        if (customPackage.status === 'booked') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete a booked package',
            });
        }

        await customPackage.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Package deleted successfully',
        });
    } catch (error) {
        console.error('Delete Package Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
};
