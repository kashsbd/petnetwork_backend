const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const Schema = mongoose.Schema;

const chatMessageSchema = new Schema(
    {
        _id: Schema.Types.ObjectId,

        //message created by user
        user: { type: Schema.Types.ObjectId, ref: "Owner" },

        text: String,

        location: { lat: String, lon: String },

        media: { type: Schema.Types.ObjectId, ref: "Media" },

        seen_by: [{ type: Schema.Types.ObjectId, ref: "Owner" }]

    },
    {
        timestamps: true
    }
)

chatMessageSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);