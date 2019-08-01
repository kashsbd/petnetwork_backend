const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const Schema = mongoose.Schema;

const articleSchema = new Schema(
    {
        _id: Schema.Types.ObjectId,

        owner: { type: Schema.Types.ObjectId, ref: 'Owner' },

        isAvailable: { type: Boolean, default: true }, // is available to users or not

        title: String,

        description: String,

        media: { type: Schema.Types.ObjectId, ref: 'Media' },

        likes: [{ type: Schema.Types.ObjectId, ref: 'Owner' }],

        comments: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
    },
    {
        timestamps: true,
    }
);

articleSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('Article', articleSchema);