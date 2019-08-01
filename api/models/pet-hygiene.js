const mongoose = require('mongoose')
const Schema = mongoose.Schema

const hygieneSchema = Schema(
    {
        _id: Schema.Types.ObjectId,

        type: String, // may be one of HAIR-CUT,NAIL-CUT,PET-MEDICATION,PET-DEWORMING

        petId: { type: Schema.Types.ObjectId, ref: "Pet" },

        caredBy: String,

        note: String,

        date: String
    },
    {
        timestamps: true
    }
)

module.exports = mongoose.model("PetHygiene", hygieneSchema);
