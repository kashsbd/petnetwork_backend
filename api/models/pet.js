const mongoose = require('mongoose');
const Schema = mongoose.Schema

const petSchema = Schema(
    {
        _id: Schema.Types.ObjectId,

        owner: { type: Schema.Types.ObjectId, ref: "Owner" },

        petType: String,

        petBreed: String,

        petCity: String,

        petName: String,

        petReward: String,

        petAge: String,

        pNPetId: String,

        petDaddyName: String,

        petMommyName: String,

        petDaddy: { type: Schema.Types.ObjectId, ref: "Pet" },

        petMommy: { type: Schema.Types.ObjectId, ref: "Pet" },

        petBirthDate: String,

        petGender: String,

        petAddress: String,

        petWeight: String,

        petDescription: String,

        petProPic: { type: Schema.Types.ObjectId, ref: "Media" },

        childList: [{ type: Schema.Types.ObjectId, ref: "Pet" }],

        matchStatus: [{ type: Schema.Types.ObjectId, ref: "MatchStatus" }],

        isAvailableForMatch: { type: Boolean, default: false },

        vaccination: [{ type: Schema.Types.ObjectId, ref: "PetVaccination" }],

        hygiene: [{ type: Schema.Types.ObjectId, ref: "PetHygiene" }],

        reminder: [{ type: Schema.Types.ObjectId, ref: "Reminder" }]

    }
)

module.exports = mongoose.model("Pet", petSchema);