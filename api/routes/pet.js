const express = require('express');
const router = express.Router();
const multer = require('multer');
const petController = require("../controllers/pet")
const { PET_PROPIC_FOLDER, PET_VACCINE_FOLDER } = require('../config/config')
const checkAuth = require('../middlewares/check-auth')


const pet_propic_storage = multer.diskStorage(
    {
        destination: function (req, file, cb) {
            cb(null, PET_PROPIC_FOLDER);
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }
)

const pet_propic_fileFilter = function (req, file, cb) {
    const mimeType = file.mimetype;
    if (mimeType.startsWith('image/')) {
        return cb(null, true)
    } else
        return cb(new Error(mimeType + " file types are not allowed"), false);
}

const pet_propic_upload = multer(
    {
        storage: pet_propic_storage,
        fileFilter: pet_propic_fileFilter,
        limits: {
            fileSize: 524288000 //500MB in bytes
        }
    }
);

const pet_vaccine_storage = multer.diskStorage(
    {
        destination: function (req, file, cb) {
            cb(null, PET_VACCINE_FOLDER);
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }
)

const pet_vaccine_fileFilter = function (req, file, cb) {
    const mimeType = file.mimetype;
    if (mimeType.startsWith('image/')) {
        return cb(null, true)
    } else
        return cb(new Error(mimeType + " file types are not allowed"), false);
}

const pet_vaccine_upload = multer(
    {
        storage: pet_vaccine_storage,
        fileFilter: pet_vaccine_fileFilter,
        limits: {
            fileSize: 524288000 //500MB in bytes
        }
    }
);

router.post("/petList", checkAuth, petController.get_pet_list)

router.post("/addPets", checkAuth, pet_propic_upload.single('petProPic'), petController.add_pet)

router.get("/getPetProPic/:mediaId", petController.get_pet_propic);

router.get("/petProfileInfo", checkAuth, petController.get_pet_profile_info);

router.get("/sameTypePets/:ownerId", checkAuth, petController.get_same_type_pets);

//about pet hygiene
router.post("/addPetHygiene", checkAuth, petController.add_pet_hygiene)

router.get("/getHygieneList", checkAuth, petController.get_hygiene_list);

router.post("/deletePreviousHygiene", checkAuth, petController.delete_previous_hygiene);

router.post("/addHygieneReminder", checkAuth, petController.set_hygiene_reminder);

router.post("/removeHygieneReminder", checkAuth, petController.remove_hygiene_reminder);

router.post("/editHygieneReminder", checkAuth, petController.edit_hygiene_reminder);

router.post("/comfirmHygieneReminder", checkAuth, petController.comfirm_hygiene_reminder);

//end points for vaccination
router.get("/vaccinationList/:petId", checkAuth, petController.get_vaccination_list)

router.post("/addVaccination", checkAuth, pet_vaccine_upload.array("vaccineImage"), petController.add_vaccination)

router.get("/showVaccinePic/:Id", petController.show_vaccine_pic)

//end points for match
router.post("/requestMatch", checkAuth, petController.send_request_match)

router.get("/getMatchRequestList/:petId", checkAuth, petController.get_match_request_list)

router.post("/comfirmMatchRequest/:matchStatusId", checkAuth, petController.comfirm_request)

router.post("/deleteMatchRequest/:matchStatusId", checkAuth, petController.delete_request)

router.post("/makeAvailableForMatch", checkAuth, petController.make_available_for_match)

router.get("/matchPetList", checkAuth, petController.get_match_petlist);

router.get('/search', checkAuth, petController.search_with_id)

module.exports = router;