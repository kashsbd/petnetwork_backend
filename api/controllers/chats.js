const mongoose = require("mongoose");
const fs = require('fs');

const ChatMessage = require("../models/chat-message");
const Conversation = require("../models/conversation");
const Owner = require("../models/owner");

const { CHAT_PIC_URL } = require('../config/config');
const { getPhotoQuality } = require('../utils/calculate-photo-quality');

exports.save_chat = async (req, res) => {

    const chat_socket = req.chat_socket;

    const chatPicFile = req.file;

    const {
        fromOwnerId,
        toOwnerId,
        text,
        locationData,
        conversationId
    } = req.body;

    let gifted_msg;

    //init chat message model
    const chat_model = new ChatMessage({ _id: new mongoose.Types.ObjectId() });
    chat_model.user = fromOwnerId;
    chat_model.seen_by.push(fromOwnerId);

    //for text message
    if (text && text.trim().length > 0) {
        chat_model.text = text;
    }

    //for chat media
    if (chatPicFile) {
        //init media model
        const media_model = new Media(
            {
                _id: new mongoose.Types.ObjectId(),
                type: 'CHAT-PIC'
            }
        );
        //check if it is image
        if (chatPicFile.mimetype.startsWith('image/')) {
            if (chatPicFile.mimetype === 'image/gif') {
                const gif = await sharp(chatPicFile.path).metadata();
                //get gif metadata 
                media_model.width = gif.width;
                media_model.height = gif.height;
                media_model.contentType = chatPicFile.mimetype;
                media_model.mediaUrl = chatPicFile.filename;
            } else {
                const imageName = Date.now() + '_compressed_' + chatPicFile.originalname.split('.')[0] + '.jpeg';
                const absolutePath = CHAT_PIC_URL + imageName;
                const pic = await sharp(chatPicFile.path).resize().jpeg({ quality: getPhotoQuality(chatPicFile.size) }).toFile(absolutePath);
                //get image metadata 
                media_model.width = pic.width;
                media_model.height = pic.height;
                media_model.contentType = chatPicFile.mimetype;
                media_model.mediaUrl = imageName;
                //finally delete original file
                fs.unlink(chatPicFile.path, (err) => {
                    if (err) console.log("Can't delete original file.");
                });
            }

            //finally save media model and push media id to chat model
            const rnMedia = await media_model.save();
            chat_model.media = rnMedia._id;
        }
    }

    //for event location
    if (locationData) {
        const location = JSON.parse(locationData);
        if (location) {
            const loc_obj = {
                lat: location.latitude,
                lon: location.longitude
            };

            chat_model.location = loc_obj;
        }
    }

    try {

        const chatMessage = await chat_model.save();

        let fromOwner = await Owner.findById(fromOwnerId).exec();

        if (conversationId) {

            let conversation = await Conversation.findById(conversationId).exec();

            if (conversation) {
                conversation.messages.push(chatMessage._id);
                await conversation.save();

                gifted_msg = {
                    _id: chat_model._id,
                    text: chat_model.text,
                    createdAt: chat_model.createdAt,
                    user: { _id: fromOwner._id, name: fromOwner.firstName + ' ' + fromOwner.lastName },
                    meta: { conversation_id: conversationId, toOwnerId }
                };
            }

        } else {

            const saved_conversations = await Conversation.find({ participants: { $all: [fromOwnerId, toOwnerId] } });
            let conver = saved_conversations[0];

            if (conver) {
                conver.messages.push(chatMessage._id);
                await conver.save();

                gifted_msg = {
                    _id: chat_model._id,
                    text: chat_model.text,
                    createdAt: chat_model.createdAt,
                    user: { _id: fromOwner._id, name: fromOwner.firstName + ' ' + fromOwner.lastName },
                    meta: { conversation_id: conver._id, toOwnerId }
                };

            } else {
                //init conversation model
                let conversation_model = new Conversation({ _id: new mongoose.Types.ObjectId() });

                conversation_model.participants.push(fromOwnerId);
                conversation_model.participants.push(toOwnerId);
                conversation_model.messages.push(chatMessage._id);

                const conversation = await conversation_model.save();

                fromOwner.conversations.push(conversation._id);
                await fromOwner.save();

                let toOwner = await Owner.findById(toOwnerId).exec();

                toOwner.conversations.push(conversation._id);
                await toOwner.save();

                gifted_msg = {
                    _id: chat_model._id,
                    text: chat_model.text,
                    createdAt: chat_model.createdAt,
                    user: { _id: fromOwner._id, name: fromOwner.firstName + ' ' + fromOwner.lastName },
                    meta: { conversation_id: conversation._id, toOwnerId }
                };
            }
        }

        //emits chat message  to chat_socket subscriber
        chat_socket.emit('chat::created', gifted_msg);

        return res.status(201).send(chat_model);


    } catch (error) {
        console.log(error)
        return res.status(500).json({ error });
    }
}


exports.get_messages = async (req, res) => {

    const { conId, toOwnerId, fromOwnerId } = req.body;

    const page = req.query.page || 1;

    let options = {
        sort: { createdAt: -1 },
        select: '-__v',
        populate: [
            { path: 'user', select: 'firstName lastName' }
        ],
        page: page
    };

    let conversation;

    try {

        if (conId) {
            conversation = await Conversation.findById(conId);
        } else {
            const saved_conversations = await Conversation.find({ participants: { $all: [toOwnerId, fromOwnerId] } });
            conversation = saved_conversations[0];
        }

        if (conversation) {
            const message_ids = conversation.messages;
            let rnMessages = await ChatMessage.paginate({ _id: { $in: message_ids } }, options);

            let messages = JSON.parse(JSON.stringify(rnMessages));

            for (let i = 0; i < messages.docs.length; i++) {
                messages.docs[i].user = { _id: messages.docs[i].user._id, name: messages.docs[i].user.firstName + ' ' + messages.docs[i].user.lastName };
            }

            return res.status(200).send(messages);
        }

        return res.status(404).json({ message: 'No valid entry found for given conversation id.' });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}

exports.notify_chat = async (req, res) => {
    const { ownerId, chatId } = req.body;

    try {
        let chat_message = await ChatMessage.findById(chatId).exec();

        if (chat_message) {
            const seen_message = chat_message.seen_by.includes(ownerId);

            if (!seen_message) {
                chat_message.seen_by.push(ownerId);
                await chat_message.save();
            }

            return res.status(200).json({ message: 'OK' });
        }

        return res.status(404).json({ message: 'No valid entry found for given id.' });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}