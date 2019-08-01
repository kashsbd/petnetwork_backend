const mongoose = require('mongoose');
const Schema = mongoose.Schema

const vetSchema = Schema(
    {
        _id: Schema.Types.ObjectId,

        isAvailable: { type: Boolean, default: true },

        owner: { type: Schema.Types.ObjectId, ref: "Owner" },

        city: String,

        address: String,

        clinicName: String,

        phoneNumber: String,

        openTime: String,

        closeTime: String,

        is24hrAvailable: Boolean,

        closeOnWeekEnd: Boolean
    },
    {
        timestamps: true,
    }
)

module.exports = mongoose.model("Vet", vetSchema);