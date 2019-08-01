const mongoose = require("mongoose");

const Vet = require("../models/vet");

exports.create_vet = async (req, res) => {
    const {
        ownerId,
        city,
        address,
        clinicName,
        phoneNumber,
        openTime,
        closeTime,
        is24hrAvailable,
        closeOnWeekEnd
    } = req.body;

    let vet = new Vet(
        {
            _id: new mongoose.Types.ObjectId(),
            owner: ownerId,
            city,
            address,
            clinicName,
            phoneNumber,
            openTime,
            closeTime,
            is24hrAvailable,
            closeOnWeekEnd
        }
    );

    try {
        const rnVet = await vet.save();
        return res.status(201).json({ msg: 'OK' });
    } catch (error) {
        return res.status(500).send(err);
    }
}

exports.get_all_vets = async (req, res) => {
    const { ownerId, city, is24hrAvailable } = req.query;

    let data = {};

    let vetQuery = { isAvailable: true, city };

    try {
        const rnVet = await Vet.find({ owner: ownerId, isAvailable: true }).exec();

        if (rnVet[0]) {
            data['isRegisteredVet'] = true;
        } else {
            data['isRegisteredVet'] = false;
        }

        if (is24hrAvailable === true) {
            vetQuery = { isAvailable: true, city, is24hrAvailable };
        }

        const rnVets = await Vet.find(vetQuery)
            .populate('owner', 'firstName lastName')
            .exec();

        data['vets'] = rnVets;

        return res.status(200).send(data);

    } catch (err) {
        return res.status(500).send(err);
    }
}

exports.get_vet_by_id = async (req, res) => {
    const vId = req.params.vId;
    const page = req.query.page || 1;

    try {
        const options = {
            sort: { createdAt: 1 },
            select: '-__v ',
            populate: [
                { path: 'commentor', select: 'firstName lastName' }
            ],
            page: page
        };

        const rnReplies = await Comment.paginate({ cmt_owner: cmtId }, options);

        return res.status(200).send(rnReplies);

    } catch (err) {
        return res.status(500).send(err);
    }
}

