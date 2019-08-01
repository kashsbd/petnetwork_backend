const mongoose = require("mongoose")
const Schema = mongoose.Schema

const ReminderSchema = Schema(
    {
        _id: mongoose.Types.ObjectId,

        pet: { type: Schema.Types.ObjectId, ref: "Pet" },

        date: String,

        type: String // may be one of HAIR-CUT, NAIL-CUT, DEWORMING, MEDICATION
    },
    {
        timestamps: true
    }
)

module.exports = mongoose.model("Reminder", ReminderSchema)