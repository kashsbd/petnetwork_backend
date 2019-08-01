const OneSignal = require('onesignal-node');
const mongoose = require('mongoose')
const sharp = require('sharp')
const fs = require('fs');
const moment = require('moment')
const _ = require('lodash');
const schedule = require("node-schedule");

const Owner = require('../models/owner')
const MatchStatus = require('../models/match-status')
const Pet = require('../models/pet')
const Media = require('../models/media')
const Reminder = require('../models/reminder')
const PetVaccination = require('../models/pet-vaccination')
const PetHygiene = require("../models/pet-hygiene")
const Notification = require('../models/notification')

const {
    PET_PROPIC_FOLDER,
    PET_VACCINE_FOLDER,
    SERVER_URL
} = require('../config/config')

const { getAllSubscriber } = require('../utils/get-all-subscriber');
const { generatePetId } = require('../utils/general-services')
const { getPhotoQuality } = require('../utils/calculate-photo-quality');

exports.make_available_for_match = async (req, res) => {

    const { status, petId } = req.body;

    try {
        let pet = await Pet.findById(petId);

        if (pet) {
            pet.isAvailableForMatch = status;
            let rnPet = await pet.save();
            return res.status(200).json({ status: 'Success' });
        }

        return res.status(404).json(
            {
                message: "No valid entry found for provided pet id"
            }
        );

    } catch (error) {
        return res.status(500).json({ error });
    }
}

// get all pet list who are ready for match
exports.get_match_petlist = async (req, res) => {
    const { pet_type, pet_breed, pet_city } = req.query;

    let query = {};

    if (pet_type === 'other') {
        query = { isAvailableForMatch: true, petType: pet_type, petCity: pet_city };
    } else {
        query = {
            isAvailableForMatch: true,
            petType: pet_type,
            petBreed: pet_breed,
            petCity: pet_city
        };
    }

    try {
        const pet = await Pet.find(query).populate('owner', 'firstName lastName').exec();
        console.log(pet)
        return res.status(200).send(pet);

    } catch (error) {
        return res.status(500).json({ error });
    }
}

exports.get_pet_list = async (req, res) => {

    const {
        ownerId,
        requestedOwnerId
    } = req.body;

    try {
        const owner = await Owner.findById(ownerId).populate('pets').exec()

        if ((ownerId === requestedOwnerId) || (owner.settings.showPetList === true)) {
            return res.status(200).json({ pets: owner.pets });
        } else {
            return res.status(401).json({ msg: "don't have permission to see pet list." })
        }

    } catch (error) {
        console.log(error)
        res.status(500).json({ error })
    }
}

exports.add_pet = async (req, res) => {

    let proPicfile = req.file;
    let petInfo = JSON.parse(req.body.petInfo)
    let i = 0

    getPetId = async () => {
        let petId = generatePetId()
        let doc = await Pet.find({ pNPetId: petId }).exec()
        i++

        if (doc.length == 0) {
            return petId
        }

        return getPetId()
    }

    try {

        let pNPetId = await getPetId()

        let rnMedia

        if (proPicfile) {

            const media = new Media({
                _id: new mongoose.Types.ObjectId,
                type: "PET_PRO_PIC"
            })

            //get metadata of propic
            const pic = await sharp(proPicfile.path).metadata();
            media.width = pic.width;
            media.height = pic.height;
            media.contentType = proPicfile.mimetype;
            media.mediaUrl = proPicfile.filename;
            rnMedia = await media.save();
        }

        const pet = new Pet({
            _id: new mongoose.Types.ObjectId,
            owner: petInfo.ownerId,
            petType: petInfo.petType.trim(),
            petCity: petInfo.petCity.trim(),
            petBreed: petInfo.petBreed.trim(),
            petName: petInfo.petName,
            petReward: petInfo.petReward,
            petDaddyName: petInfo.petDaddyName,
            petMommyName: petInfo.petMommyName,
            petBirthDate: petInfo.petBirthDate,
            petGender: petInfo.petGender,
            petWeight: petInfo.petWeight,
            petDescription: petInfo.petDescription,
            petProPic: rnMedia._id,
            pNPetId: pNPetId,
        })

        const rnPet = await pet.save();

        if (petInfo.petDaddyId != "") {
            rnPet.petDaddy = petInfo.petDaddyId
            rnPet.save();
            pet.petDaddy = petInfo.petDaddyId
            let petDaddy = await Pet.findById(petInfo.petDaddy);
            petDaddy.childList.push(rnPet._id);
            petDaddy.save();
        }

        if (petInfo.petMommyId != "") {
            rnPet.petMommy = petInfo.petMommyId
            rnPet.save();
            let petMommy = await Pet.findById(petInfo.petMommyId);
            petMommy.childList.push(rnPet._id);
            petMommy.save();
        }

        let owner = await Owner.findById(petInfo.ownerId);
        owner.pets.push(rnPet._id);
        owner.save();
        res.status(201).json({ "message": "SAVED" })

    } catch (error) {
        console.log(error)
        res.status(500).json({
            "message": "ERROR"
        })
    }
};

exports.get_pet_propic = async (req, res) => {

    const mediaId = req.params.mediaId

    try {
        const petProPic = await Media.findById(mediaId);

        if (petProPic) {
            petProPicUrl = PET_PROPIC_FOLDER + petProPic.mediaUrl

            fs.readFile(petProPicUrl, (error, data) => {
                if (error) {
                    res.status(404).json({
                        "message": "No Such File"
                    })
                }
                res.writeHead(200, { 'Content-Type': petProPic.contentType })
                res.end(data);
            })
        }
    } catch (error) {
        console.log("ERROR", error)
        res.status(500).json({
            "message": "ERROR"
        })
    }
}

exports.get_pet_profile_info = async (req, res) => {

    const petId = req.query.petId
    const ownerId = req.query.ownerId
    let rnInfo = []

    try {
        let requestedPetInfo = await Pet.findById(petId).populate("owner", "firstName lastName");

        let requesterOwnerInfo = await Owner.findById(ownerId, "pets")
            .populate({ path: "pets", match: { petType: requestedPetInfo.petType } })

        let requestedPetMatchId = requestedPetInfo.matchStatus
        let rnStatusInfo = {}
        //first return pet Info
        rnInfo.push(requestedPetInfo);

        //second pet's current status
        //when owner is requested pet's owner
        if (requestedPetInfo.owner._id == ownerId) {
            console.log("Own pet")
            rnStatusInfo.status = "NO_STATUS"
            rnStatusInfo.matchStatusId = ""
            rnInfo.push(rnStatusInfo)
            //when request pets has no  match status
        } else if (requestedPetMatchId.length < 1) {
            console.log("requested pet has no Match Id")
            rnStatusInfo.status = "NO_STATUS"
            rnStatusInfo.matchStatusId = ""
            rnInfo.push(rnStatusInfo)
        } else {
            //requester all pets' matchStatusIds
            let requesterMatchStatusId = []
            //requester has no pets
            if (requesterOwnerInfo.pets.length < 1) {
                console.log("requester has no Pets")
                rnStatusInfo.status = "NO_STATUS"
                rnStatusInfo.matchStatusId = ""
                rnInfo.push(rnStatusInfo)
            } else {
                requesterOwnerInfo.pets.forEach(pet => {
                    if (pet.matchStatus.length > 0) {
                        pet.matchStatus.forEach(id => {
                            requesterMatchStatusId.push(id)
                        });
                    }
                });

                let result = "";
                if (requesterMatchStatusId.length > 0) {
                    //result = _.intersection(requesterMatchStatusId, requestedPetMatchId);
                    requesterMatchStatusId.forEach(Id => {
                        const index = requestedPetMatchId.indexOf(Id)

                        if (index != -1) {
                            result = Id
                            return
                        }
                    });
                    if (result != "") {
                        let mStatus = await MatchStatus.findById(result).exec();
                        if (mStatus) {
                            if (mStatus.matchStatus == "REQUEST_SENT") {
                                //petId is requestedId

                                if (mStatus.matchRequestFrom == petId) {

                                    rnStatusInfo.status = "COMFIRM"
                                    rnStatusInfo.matchStatusId = result
                                    rnInfo.push(rnStatusInfo)
                                } else {
                                    rnStatusInfo.status = "REQUEST_SENT"
                                    rnStatusInfo.matchStatusId = result
                                    rnInfo.push(rnStatusInfo)
                                }

                            } else {
                                rnStatusInfo.status = "MATCHED"
                                rnStatusInfo.matchStatusId = result
                                rnInfo.push(rnStatusInfo)
                            }
                        } else {

                            rnStatusInfo.status = "NO_STATUS"
                            rnStatusInfo.matchStatusId = ""
                            rnInfo.push(rnStatusInfo)
                        }

                    } else {

                        rnStatusInfo.status = "NO_STATUS"
                        rnStatusInfo.matchStatusId = ""
                        rnInfo.push(rnStatusInfo)
                    }
                } else {
                    rnStatusInfo.status = "NO_STATUS"
                    rnStatusInfo.matchStatusId = ""
                    rnInfo.push(rnStatusInfo)
                    console.log("All pets have no match status ids")
                }
            }
        }

        res.status(200).json({ rnInfo })

    } catch (error) {

        console.log(error);
        res.status(500).json({ "message": "ERROR" });
    }
}

exports.get_same_type_pets = async (req, res) => {
    const ownerId = req.params.ownerId
    const petType = req.query.type

    try {
        let petOwner = await Owner.findById(ownerId, "pets")
            .populate({
                path: "pets",
                match: { petType: petType }
            })

        res.status(200).json({
            "petList": petOwner.pets
        })
    } catch (error) {
        res.status(500).json({
            "message": "ERROR"
        })
    }
}

exports.send_request_match = async (req, res) => {
    let matchFrom = req.body.matchFrom
    let matchTo = req.body.matchTo
    const noties_socket = req.noties_socket;
    const onesignal_client = req.onesignal_client

    let background_playerIds = []
    try {
        //initiate model
        const matchStatus = new MatchStatus({
            _id: new mongoose.Types.ObjectId,
            matchRequestFrom: matchFrom,
            matchRequestTo: matchTo,
            matchStatus: "REQUEST_SENT",
            requestedDate: Date.now(),
        })
        //saving match status
        const rnMatchStatus = await matchStatus.save();

        let petFrom = await Pet.findById(matchFrom);
        petFrom.matchStatus.push(rnMatchStatus._id)
        let rnfrom = await petFrom.save();
        let petTo = await Pet.findById(matchTo);
        console.log("petto", petTo.owner)
        petTo.matchStatus.push(rnMatchStatus._id);
        petTo.save();

        const newNoti = new Notification(
            {
                _id: new mongoose.Types.ObjectId(),
                type: "MATCH-REQUEST",
                createdBy: rnfrom.owner,
                dataId: rnfrom._id,
                media: rnfrom.petProPic
            }
        )

        const noti = await newNoti.save();

        let rnNoti = await Notification.findById(noti._id)
            .populate('createdBy', 'firstName lastName')
            .populate('media', 'contentType')
            .exec();

        const noti_subscriber = getAllSubscriber(noties_socket)

        for (let i = 0, len = noti_subscriber.length; i < len; i++) {

            const { each_socket, owner_id } = noti_subscriber[i];

            if (owner_id === String(petTo.owner)) {
                rnNoti && each_socket.emit('noti::created', rnNoti)
            }
        }

        let toOwner = await Owner.findById(petTo.owner);
        //sent noti to requested pet's owner to notify
        if (toOwner !== null) {
            const playerIds = toOwner.playerIds

            for (let j of playerIds) {
                const { playerId, status } = j;
                if (status === 'background' || status === 'inactive') {
                    background_playerIds.push(playerId);
                }
            }
            toOwner.notiLists.push(rnNoti._id);

            try {
                let rnOwner = await toOwner.save();
            } catch (error) {
                console.log("can't save owner", error)
            }
        }

        if (background_playerIds.length >= 1) {

            if (rnNoti) {
                console.log("kk", rnNoti)
                const description = rnNoti.createdBy.firstName + ' sent you a match request.';
                let pic_path = '';
                if (rnNoti.media) {
                    pic_path = SERVER_URL + '/pets/getPetProPic/' + rnNoti.media._id;
                }

                const fn = new OneSignal.Notification({
                    headings: {
                        en: 'PetNetwork'
                    },
                    contents: {
                        en: description
                    },
                    priority: 10,
                    ///profile_pic/:ownerId"
                    large_icon: SERVER_URL + '/owners/profile_pic/' + rnNoti.createdBy._id,
                    big_picture: pic_path,
                    include_player_ids: background_playerIds
                });

                try {
                    const push_response = await onesignal_client.sendNotification(fn);
                } catch (error) {
                    console.log(error);
                }
            }
        }

        res.status(200).json({
            message: "OK"
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "NOT_OK"
        })
    }
}

exports.get_match_request_list = async (req, res) => {

    const petId = req.params.petId
    let rnData = []
    try {

        let pet = await Pet.findById(petId, "matchStatus _id")
            .populate({
                path: "matchStatus",
                match: { matchStatus: "REQUEST_SENT", matchRequestTo: petId },
                populate: { path: "matchRequestFrom", model: "Pet", select: "petName petProPic petAddress" }
            })
            .exec();


        if (pet.matchStatus.length > 0) {

            for (let item of pet.matchStatus) {
                rnData.push(item)
            }
        }

        res.status(200).json({ Data: rnData })

    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "ERROR"
        })
    }
}

exports.comfirm_request = async (req, res) => {
    const matchstatusId = req.params.matchStatusId
    try {
        let matchStatus = await MatchStatus.findById(matchstatusId).exec()
        if (matchStatus) {
            matchStatus.matchStatus = "MATCHED"
            await matchStatus.save();
        }
        res.status(200).send();

    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: error
        })
    }
}

exports.delete_request = async (req, res) => {

    let matchStatusId = req.params.matchStatusId

    try {

        let matchStatus = await MatchStatus.findById(matchStatusId).exec();

        let from = await Pet.findById(matchStatus.matchRequestFrom).exec();

        let to = await Pet.findById(matchStatus.matchRequestTo).exec()

        if (from) {
            const index = from.matchStatus.indexOf(matchStatusId);
            if (index > -1) {
                from.matchStatus.splice(index, 1);
                from.save();
            }
        }

        if (to) {
            const index = to.matchStatus.indexOf(matchStatusId);
            if (index > -1) {
                to.matchStatus.splice(index, 1);
                to.save();
            }
        }
        res.status(200).send();

    } catch (error) {
        res.status(500).send();
        console.log(error)
    }
}

exports.get_vaccination_list = async (req, res) => {
    let petId = req.params.petId
    let rnData = []
    try {
        let pet = await Pet.findById(petId, "vaccination -_id")
            .populate("vaccination")
            .exec();
        for (let i = 0; i < pet.vaccination.length; i++) {
            rnData.push(pet.vaccination[i]);
        }
        res.status(200).send(rnData);
    } catch (error) {
        console.log(error)
        res.status(500).send(error)
    }
}

exports.add_vaccination = async (req, res) => {
    const vaccine_pics = req.files;
    const onesignal_client = req.onesignal_client;
    const noties_socket = req.noties_socket;

    const { vaccinationInfo } = req.body;

    let background_playerIds = [];

    try {
        const {
            vaccineName,
            injectionDate,
            vaccinationNote,
            nextInjectionDate,
            petId,
            caredType
        } = JSON.parse(vaccinationInfo);

        const vaccination_modal = new PetVaccination({
            _id: new mongoose.Types.ObjectId,
            vaccineName,
            injectionDate,
            nextInjectionDate,
            vaccinationNote,
            pet: petId,
            caredType
        });

        let pet = await Pet.findById(petId).populate("owner").exec();

        const noti_modal = new Notification({
            _id: new mongoose.Types.ObjectId,
            createdBy: pet.owner._id,
            type: "NEXT-VACCINE",
            media: pet.petProPic,
            dataId: pet._id
        });

        if (vaccine_pics && vaccine_pics.length > 0) {

            for (let file of vaccine_pics) {

                const media = new Media({
                    _id: new mongoose.Types.ObjectId,
                    type: "VACCINE_PIC"
                });

                const imageName = Date.now() + '_compressed_' + file.originalname.split('.')[0] + '.jpeg';
                const absolutePath = PET_VACCINE_FOLDER + imageName;
                const pic = await sharp(file.path).resize().jpeg({ quality: getPhotoQuality(file.size) }).toFile(absolutePath);

                media.width = pic.width;
                media.height = pic.height;
                media.contentType = file.mimetype;
                media.mediaUrl = imageName;

                const rnMedia = await media.save();
                vaccination_modal.vaccinePic.push(rnMedia._id);

                fs.unlink(file.path, (err) => {
                    if (err) console.log("Can't delete original file.");
                });
            }


            if (nextInjectionDate && nextInjectionDate !== "") {

                const next = new Date(nextInjectionDate);

                console.log(next);

                const formatNext = new Date(next.getFullYear(), next.getMonth(), next.getDate(), 17, 10, 0);
                //schedule for next injection
                const j = schedule.scheduleJob(formatNext, async () => {
                    console.log('I am in');

                    const noti = await noti_modal.save();

                    const rnNoti = await Notification.findById(noti._id)
                        .populate('createdBy', 'firstName lastName')
                        .populate('media', 'contentType')
                        .exec();

                    let o = await Owner.findById(pet.owner._id).exec();
                    o.notiLists.push(rnNoti._id);
                    await o.save();

                    const noti_subscriber = getAllSubscriber(noties_socket);

                    for (let i = 0, len = noti_subscriber.length; i < len; i++) {

                        const { each_socket, owner_id } = noti_subscriber[i];

                        if (owner_id === String(pet.owner._id)) {
                            rnNoti && each_socket.emit('noti::created', rnNoti)
                        }
                    }

                    if (pet.owner.playerIds.length > 0) {

                        for (let p of pet.owner.playerIds) {
                            background_playerIds.push(p.playerId)
                        }

                        if (rnNoti) {
                            const description = `Hi ${pet.owner.firstName} Today is vaccination`
                            let pic_path = '';
                            if (rnNoti.media) {
                                pic_path = SERVER_URL + '/pets/getPetProPic/' + rnNoti.media._id;
                            }

                            const fn = new OneSignal.Notification({
                                headings: {
                                    en: 'PetNetwork'
                                },
                                contents: {
                                    en: description
                                },
                                priority: 10,
                                large_icon: SERVER_URL + '/owners/profile_pic/' + rnNoti.createdBy._id,
                                big_picture: pic_path,
                                include_player_ids: background_playerIds,
                                send_after: moment.unix(1551207900).utc().format('MMMM Do YYYY, h:mm:ss a')
                            });

                            try {
                                const push_response = await onesignal_client.sendNotification(fn);
                                console.log("Push", push_response.data)
                            } catch (error) {
                                console.log(error);
                            }
                        }
                    }
                })
            }

            const rnVaccination = await vaccination_modal.save();
            pet.vaccination.push(rnVaccination._id);
            await pet.save();

            return res.status(201).json({ message: 'ok' });

        } else {
            res.status(400).json({
                message: "NO vaccine image includes!"
            })
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error });
    }
}

exports.show_vaccine_pic = async (req, res) => {

    let pic_id = req.params.Id

    try {
        const vaccine_pic = await Media.findById(pic_id);

        if (vaccine_pic) {
            vaccinePicUrl = PET_VACCINE_FOLDER + vaccine_pic.mediaUrl
            fs.readFile(vaccinePicUrl, (error, data) => {
                if (error) {
                    console.log('error', error);
                    return res.status(404).json({
                        "message": "No Such File"
                    })
                }
                res.writeHead(200, { 'Content-Type': vaccine_pic.contentType })
                res.end(data);
            })
        }
    } catch (error) {
        console.log("ERROR", error)
        return res.status(500).json({ error });
    }
}

exports.add_pet_hygiene = async (req, res) => {
    const { note, petId, caredType, type, date } = req.body;

    try {
        const petHygiene = new PetHygiene(
            {
                _id: new mongoose.Types.ObjectId,
                note,
                petId,
                caredBy: caredType,
                type,
                date
            }
        );

        const rnPetHygiene = await petHygiene.save();

        let pet = await Pet.findById(petId).exec();

        pet.hygiene.push(rnPetHygiene._id);
        pet.save();

        return res.status(201).send();

    } catch (error) {
        console.log("error", error)
        return res.status(500).json({ error });
    }
}

exports.get_hygiene_list = async (req, res) => {
    const { petId, type } = req.query;

    let hairCut = {}

    try {
        const pet = await Pet.findById(petId, "hygiene reminder -_id")
            .populate({ path: "hygiene", match: { type } })
            .populate({ path: "reminder", match: { type } })
            .sort({ createdAt: -1 })
            .exec();

        hairCut.previousRecord = pet.hygiene;
        hairCut.upcomming = pet.reminder[pet.reminder.length - 1];

        res.status(200).send(hairCut);

    } catch (error) {
        console.log(error)
        res.status(500).json({ error });
    }
}

exports.delete_previous_hygiene = async (req, res) => {
    const { petId, hygieneId } = req.body;

    try {
        let pet = await Pet.findById(petId).exec();

        const index = pet.hygiene.indexOf(hygieneId);

        if (index >= 0) {
            pet.hygiene.splice(index, 1);
        }

        await pet.save();

        await PetHygiene.deleteOne({ "_id": new mongoose.Types.ObjectId(hygieneId) }).exec();

        return res.status(200).send();

    } catch (error) {
        console.log("error", error)
        return res.status(500).json({ error });
    }
}

exports.set_hygiene_reminder = async (req, res) => {
    const { petId, type, date } = req.body;

    try {

        const reminder = new Reminder(
            {
                _id: new mongoose.Types.ObjectId,
                pet: petId,
                type,
                date
            }
        );

        const rnReminder = await reminder.save();

        let pet = await Pet.findById(petId, "reminder")
            .populate({ path: "reminder", match: { type } })
            .exec();

        pet.reminder.push(rnReminder._id);
        await pet.save();

        return res.status(201).send(rnReminder);

    } catch (error) {
        console.log("error", error)
        return res.status(500).json({ error });
    }
}

exports.remove_hygiene_reminder = async (req, res) => {
    const { petId, reminderId } = req.body;

    try {
        let pet = await Pet.findById(petId).exec();

        const index = pet.reminder.indexOf(reminderId);

        if (index >= 0) {
            pet.reminder.splice(index, 1);
        }

        pet.save();

        await Reminder.deleteOne({ "_id": new mongoose.Types.ObjectId(reminderId) }).exec();

        return res.status(200).send();

    } catch (error) {
        console.log(error)
        return res.status(500).json({ error });
    }
}

exports.edit_hygiene_reminder = async (req, res, next) => {
    const { reminderId, date } = req.body;

    try {
        let reminder = await Reminder.findById(reminderId).exec();

        if (reminder) {

            reminder.date = date;

            const rnReminder = await reminder.save();

            return res.status(200).send(rnReminder);
        }

        return res.status(404).json({ message: 'No valid entry found for provided id.' });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}

exports.comfirm_hygiene_reminder = async (req, res) => {
    const { note, petId, caredType, type, reminderId, date } = req.body;

    try {
        const petHygiene = new PetHygiene(
            {
                _id: new mongoose.Types.ObjectId,
                note,
                petId,
                caredBy: caredType,
                type,
                date
            }
        );

        const rnHygiene = await petHygiene.save();

        let pet = await Pet.findById(petId).exec();
        pet.hygiene.push(rnHygiene._id);

        const index = pet.reminder.indexOf(reminderId);

        if (index >= 0) {
            pet.reminder.splice(index, 1);
        }

        await pet.save();

        await Reminder.deleteOne({ "_id": new mongoose.Types.ObjectId(reminderId) }).exec();

        const rnData = await Pet.findById(petId, "hygiene -_id")
            .populate({ path: "hygiene", match: { type } })
            .exec();

        return res.status(201).send(rnData.hygiene);

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}

exports.search_with_id = async (req, res) => {
    const { query } = req.query;

    try {
        const pets = await Pet.find({ })
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}

