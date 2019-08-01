const mongoose = require('mongoose');
const Notification = require("../models/notification");

exports.notify_saved = async (req, res) => {
    const notiId = req.params.notiId;

    try {
        const noti = await Notification.findById(notiId).exec();

        if (noti) {

            noti.isSavedInClient = true;

            await noti.save();

            return res.status(200).json({ msg: 'OK' });
        }

        return res.status(404).json({
            msg: 'No valid entry found for provided id.'
        })

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}