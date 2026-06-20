const PackageTemplate = require('../models/packageTemplate-Model');
const Asset = require('../models/asset-Model');

const validateTemplateInput = async (body, guideId, partial = false) => {
    const updates = {};

    if (!partial || body.name !== undefined) {
        if (!body.name || !String(body.name).trim()) {
            throw new Error('Template name is required');
        }
        updates.name = String(body.name).trim();
    }

    if (body.description !== undefined) updates.description = String(body.description).trim();

    if (body.basePrice !== undefined) {
        const basePrice = Number(body.basePrice);
        if (!Number.isFinite(basePrice) || basePrice < 0) throw new Error('basePrice must be a non-negative number');
        updates.basePrice = basePrice;
    }

    if (body.discount !== undefined) {
        const discount = Number(body.discount);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error('discount must be between 0 and 100');
        updates.discount = discount;
    }

    if (!partial || body.assets !== undefined) {
        const assets = Array.isArray(body.assets) ? body.assets : [];
        const assetIds = assets.map((item) => item.assetId);
        const ownedAssets = await Asset.find({ _id: { $in: assetIds }, guide: guideId }).select('_id quantityAvailable');
        const ownedMap = new Map(ownedAssets.map((asset) => [asset._id.toString(), asset]));

        updates.assets = assets.map((item) => {
            const asset = ownedMap.get(String(item.assetId));
            const quantity = Number(item.quantity);

            if (!asset) throw new Error(`Asset with ID ${item.assetId} not found for this guide`);
            if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Asset quantity must be a positive integer');
            if (quantity > asset.quantityAvailable) throw new Error(`Only ${asset.quantityAvailable} units available for asset ${item.assetId}`);

            const normalized = { assetId: item.assetId, quantity };
            if (item.fixedPrice !== undefined && item.fixedPrice !== null && item.fixedPrice !== '') {
                const fixedPrice = Number(item.fixedPrice);
                if (!Number.isFinite(fixedPrice) || fixedPrice < 0) throw new Error('fixedPrice must be a non-negative number');
                normalized.fixedPrice = fixedPrice;
            }
            return normalized;
        });
    }

    return updates;
};

exports.createTemplate = async (req, res) => {
    try {
        if (req.user.role !== 'guide') return res.status(403).json({ success: false, message: 'Only guides can create templates' });

        const templateData = await validateTemplateInput(req.body, req.user._id);
        const template = await PackageTemplate.create({ ...templateData, guide: req.user._id });
        const populated = await PackageTemplate.findById(template._id).populate('assets.assetId');

        res.status(201).json({ success: true, message: 'Template created successfully', template: populated });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Server error' });
    }
};

exports.getMyTemplates = async (req, res) => {
    try {
        if (req.user.role !== 'guide') return res.status(403).json({ success: false, message: 'Only guides can view their templates' });

        const templates = await PackageTemplate.find({ guide: req.user._id }).populate('assets.assetId').sort('-createdAt');
        res.status(200).json({ success: true, count: templates.length, templates });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getGuideTemplates = async (req, res) => {
    try {
        const templates = await PackageTemplate.find({ guide: req.params.guideId }).populate('assets.assetId').sort('-createdAt');
        res.status(200).json({ success: true, count: templates.length, templates });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        if (req.user.role !== 'guide') return res.status(403).json({ success: false, message: 'Only guides can update templates' });

        const template = await PackageTemplate.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
        if (template.guide.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'You can only update your own templates' });
        }

        const updates = await validateTemplateInput(req.body, req.user._id, true);
        Object.assign(template, updates);
        await template.save();

        const populated = await PackageTemplate.findById(template._id).populate('assets.assetId');
        res.status(200).json({ success: true, message: 'Template updated successfully', template: populated });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Server error' });
    }
};

exports.deleteTemplate = async (req, res) => {
    try {
        if (req.user.role !== 'guide') return res.status(403).json({ success: false, message: 'Only guides can delete templates' });

        const template = await PackageTemplate.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
        if (template.guide.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'You can only delete your own templates' });
        }

        await template.deleteOne();
        res.status(200).json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
