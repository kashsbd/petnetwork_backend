const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const Schema = mongoose.Schema;

const conversationSchema = new Schema(
    {
        _id: Schema.Types.ObjectId,

        participants: [{ type: Schema.Types.ObjectId, ref: 'Owner' }],

        messages: [{ type: Schema.Types.ObjectId, ref: 'ChatMessage' }]
    },
    {
        timestamps: true
    }
)

conversationSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Conversation', conversationSchema);