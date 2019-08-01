const express = require('express');
const router = express.Router();
const multer = require('multer');

const chatsController = require("../controllers/chats");
const { CHAT_PIC_URL } = require('../config/config');
const checkAuth = require('../middlewares/check-auth');

const chat_pic_storage = multer.diskStorage(
    {
        destination: function (req, file, cb) {
            cb(null, CHAT_PIC_URL);
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }
)

const chat_pic_filter = function (req, file, cb) {
    const mimeType = file.mimetype;
    if (mimeType.startsWith('image/')) {
        return cb(null, true)
    } else
        return cb(new Error(mimeType + " file types are not allowed"), false);
}

const chat_pic_upload = multer(
    {
        storage: chat_pic_storage,
        fileFilter: chat_pic_filter,
        limits: {
            fileSize: 20000000 //20MB in bytes
        }
    }
);

router.post("/", checkAuth, chat_pic_upload.single('chatPic'), chatsController.save_chat);

router.post("/getAllMessages", checkAuth, chatsController.get_messages);

router.post('/notifyChatMessage', checkAuth, chatsController.notify_chat);


module.exports = router;