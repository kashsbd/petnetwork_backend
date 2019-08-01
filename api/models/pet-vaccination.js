const mongoose = require('mongoose');
const Schema = mongoose.Schema

const petVaccination = Schema(
    {
        _id: Schema.Types.ObjectId,

        vaccineName: String,

        injectionDate: String,

        nextInjectionDate: String,

        vaccinationNote: String,

        caredType: String,

        pet: { type: Schema.Types.ObjectId, ref: "Pet" },

        vaccinePic: [{ type: Schema.Types.ObjectId, ref: "Media" }],

    }
)

module.exports = mongoose.model("PetVaccination", petVaccination);