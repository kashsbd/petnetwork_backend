const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const Schema = mongoose.Schema;

const eventpostSchema = new Schema(
    {
        _id: Schema.Types.ObjectId,

        post_owner: { type: Schema.Types.ObjectId, ref: 'Event' },

        isAvailable: { type: Boolean, default: true }, // is available to users or not

        isPublic: { type: Boolean, default: true },

        owner: { type: Schema.Types.ObjectId, ref: 'Owner' },

        media: [{ type: Schema.Types.ObjectId, ref: 'Media' }],

        description: String,

        likes: [{ type: Schema.Types.ObjectId, ref: 'Owner' }],

        comments: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
    },
    {
        timestamps: true,
    }
);

eventpostSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('EventPost', eventpostSchema);