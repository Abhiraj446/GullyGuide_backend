const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const defaultPackages = [
    { name: 'Standard', multiplier: 1.0 },
    { name: 'Medium', multiplier: 1.5 },
    { name: 'Premium', multiplier: 3.0 },
];

const postSchema = new Schema({
    title : {
        type : String,
        required : true
    },
    body : {
        type : String,
        required : true
    },
    photo : {
        type : String,
        required : true
    },
    likes : [{type : ObjectId, ref : "User"}],
    comments : [{
        _id: { type: ObjectId, auto: true },
        text : String,
        commentedBy : {type : ObjectId, ref : "User"},
        likes: [{type : ObjectId, ref : "User"}]
    }],
     price : {
        type : Number,
        required : true,
        min : 0
    },
    packages: {
        type: [{
            name: {
                type: String,
                required: true,
                enum: ['Standard', 'Medium', 'Premium']
            },
            multiplier: {
                type: Number,
                required: true,
                min: 0
            }
        }],
        default: defaultPackages
    },

    postedBy : {
        type : ObjectId,
        ref : 'User'
    },
    // location: {
    //     city: String,
    //     state: String,
    //     coordinates: {
    //         lat: Number,
    //         lng: Number,
    //     },
    // }
    location: {
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    coordinates: {
        lat: Number,
        lng: Number,
    },
}
},{
    timestamps : true
})

const Post = mongoose.model('Post', postSchema);
module.exports = Post;
