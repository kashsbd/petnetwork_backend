const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const Schema = mongoose.Schema;

const eventSchema = new Schema(
    {
        _id: Schema.Types.ObjectId,

        isAvailable: { type: Boolean, default: true }, // is available to users or not

        isPublic: { type: Boolean, default: true },

        owner: { type: Schema.Types.ObjectId, ref: 'Owner' },

        media: [{ type: Schema.Types.ObjectId, ref: 'Media' }],

        location: { name: String, address: String, lat: String, lon: String },

        event_name: String,

        description: String,

        start_date_time: Date,

        end_date_time: Date,

        invited_owner: [{ type: Schema.Types.ObjectId, ref: 'Owner' }],

        interested: [{ type: Schema.Types.ObjectId, ref: 'Owner' }],

        going: [{ type: Schema.Types.ObjectId, ref: 'Owner' }]
    },
    {
        timestamps: true,
    }
);

eventSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Event', eventSchema);
