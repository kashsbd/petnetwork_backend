const mongoose = require('mongoose');
const sharp = require('sharp');
const fs = require('fs');
const OneSignal = require('onesignal-node');
const readFilePromise = require('fs-readfile-promise');

const Event = require("../models/event");
const SubEvent = require("../models/eventpost");
const Owner = require("../models/owner");
const Media = require("../models/media");
const Comment = require("../models/comment");
const Notification = require('../models/notification');

const { EVENT_URL, THUMBNAIL_URL, SERVER_URL } = require('../config/config');
const { resizeVideo, getThumbnail } = require('../utils/convert-video');
const { getPhotoQuality } = require('../utils/calculate-photo-quality');
const { getAllSubscriber } = require('../utils/get-all-subscriber');

const _ = require('lodash');

exports.get_all_posts = async (req, res, next) => {
    const page = req.query.page || 1;

    // limit is 10 as default in mongoose pagination
    const options = {
        sort: { createdAt: -1 },
        select: '-__v',
        populate: [
            { path: 'owner', select: 'firstName lastName' },
            { path: 'media', select: 'width height contentType' },
        ],
        page: page
    };

    try {
        const result = await Event.paginate({ isAvailable: true, isPublic: true }, options);
        return res.status(200).send(result);
    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.get_post_by_id = async (req, res) => {
    const id = req.params.eid;

    try {
        let doc = await Event.find({ _id: id, isAvailable: true })
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .exec();

        if (doc[0]) {
            //append type to show correctly in noti view
            let rnDoc = JSON.parse(JSON.stringify(doc[0]));
            rnDoc['type'] = 'EVENT';
            return res.status(200).send(rnDoc);
        }

        return res.status(404).json({
            message: "No valid entry found for provided ID"
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.render_web_post = async (req, res) => {
    const eventId = req.params.eventId;
    let og_tags = [];

    try {
        let doc = await Event.findById(eventId)
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .exec();

        if (doc && doc.isAvailable) {
            let rnDoc = JSON.parse(JSON.stringify(doc));
            rnDoc['type'] = 'EVENT';
            //check populated post and push to og_tags to use in ejs
            //og tag for status
            if (rnDoc.description) {
                og_tags.push({ tag_name: 'og:description', content: rnDoc.description });
            }

            //og tags for media
            if (rnDoc.media[0]) {
                const first_media = rnDoc.media[0];
                og_tags.push({ tag_name: 'og:image', content: SERVER_URL + '/events/media/' + first_media._id + '/1.jpg' });
                og_tags.push({ tag_name: 'og:image:type', content: first_media.contentType });
                og_tags.push({ tag_name: 'og:image:width', content: first_media.width });
                og_tags.push({ tag_name: 'og:image:height', content: first_media.height });
            }

            const owner_name = rnDoc.owner.firstName + ' ' + rnDoc.owner.lastName;
            //og tags for title
            og_tags.push({ tag_name: 'og:title', content: owner_name + ' created an event on PetNetwork.' });

            return res.render('index', { og_tags });
        }

        return res.status(404).json({
            message: "No valid entry found for provided ID"
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.get_all_subposts = async (req, res, next) => {
    const page = req.query.page || 1;
    const eid = req.params.eid;
    // limit is 10 as default  in mongoose pagination
    const options = {
        sort: { createdAt: -1 },
        select: '-__v',
        populate: [
            { path: 'owner', select: 'firstName lastName' },
            { path: 'media', select: 'width height contentType' },
        ],
        page: page
    };

    let posts = {};

    try {
        const headerData = await Event.find({ _id: eid, isAvailable: true })
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .exec();

        if (headerData && headerData[0]) {
            posts['headerData'] = headerData[0];
        } else {
            return res.status(404).json({
                message: 'No valid data found for provided id'
            });
        }
        const result = await SubEvent.paginate({ isAvailable: true, post_owner: eid }, options);
        posts['posts'] = result;
        console.log(posts.headerData.location)
        return res.status(200).send(posts);
    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.interest_post = async (req, res) => {
    const eid = req.params.eid;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;

    try {
        const post = await Event.findById(eid);

        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);

            //add user id only if it is not found in interested list
            if (post.interested.indexOf(liker) === -1) {
                post.interested.push(liker);
                const rnPost = await post.save();

                if (rnPost) {
                    const interested = { id: rnPost._id, going: rnPost.going, interested: rnPost.interested };
                    //emits event interested count to likes_socket subscriber
                    likes_socket.emit('event::reacted', interested);
                }

                return res.status(200).json({
                    message: "OK",
                });
            }

            return res.status(200).json({
                message: "OK"
            });
        }

        return res.status(404).json({
            message: "No valid entry found for provided event id"
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.going_event = async (req, res) => {
    const eid = req.params.eid;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;

    try {
        const post = await Event.findById(eid);

        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);

            //add user id only if it is not found in going list
            if (post.going.indexOf(liker) === -1) {
                post.going.push(liker);
                const rnPost = await post.save();

                if (rnPost) {
                    const going = { id: rnPost._id, going: rnPost.going, interested: rnPost.interested };
                    //emits event going count to likes_socket subscriber
                    likes_socket.emit('event::reacted', going);
                }

                return res.status(200).json({
                    message: "OK",
                });
            }

            return res.status(200).json({
                message: "OK"
            });
        }

        return res.status(404).json({
            message: "No valid entry found for provided event id"
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.like_subpost = async (req, res, next) => {
    const seid = req.params.seid;
    const ownerId = req.body.ownerId;

    const {
        likes_socket,
        noties_socket,
        onesignal_client
    } = req;

    let background_playerIds = [];

    try {
        const post = await SubEvent.findById(seid);

        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);

            //add liker id only if it is not found in likes list
            if (post.likes.indexOf(liker) === -1) {
                post.likes.push(liker);
                const rnPost = await post.save();
                if (rnPost) {
                    const likes = { id: rnPost._id, likesCount: rnPost.likes.length };
                    //emits post likes to likes_socket subscriber
                    likes_socket.emit('subevent::reacted', likes);
                }

                //create notification model
                //noti type is LIKE-SUBEVENT, so we put tid in dataId
                const newNoti = new Notification(
                    {
                        _id: new mongoose.Types.ObjectId(),
                        type: 'LIKE-SUBEVENT',
                        createdBy: ownerId,
                        dataId: post.post_owner
                    }
                );

                if (post.media.length >= 1) {
                    newNoti.media = post.media[0];
                } else {
                    newNoti.media = null;
                }

                const noti = await newNoti.save();

                let rnNoti = await Notification.findById(noti._id)
                    .populate('createdBy', 'firstName lastName')
                    .populate('media', 'contentType')
                    .exec();

                const noti_subscriber = getAllSubscriber(noties_socket);

                for (let i = 0, len = noti_subscriber.length; i < len; i++) {

                    const { each_noti_socket, user_id } = noti_subscriber[i];

                    //make sure not to send to own
                    if ((user_id === String(post.owner)) && (user_id !== ownerId)) {

                        rnNoti && each_noti_socket.emit('noti::created', rnNoti);
                    }
                }

                const post_owner = await Owner.findById(post.owner);

                if (post_owner !== null && (String(post.owner) !== ownerId)) {
                    const playerIds = post_owner.playerIds;

                    for (let j of playerIds) {
                        const { playerId, status } = j;
                        if (status === 'background' || status === 'inactive') {
                            background_playerIds.push(playerId);
                        }
                    }

                    post_owner.notiLists.push(noti._id);

                    try {
                        const rnPostOwner = await post_owner.save();
                    } catch (error) {
                        console.log("Can't save post_owner.");
                    }

                }

                if (background_playerIds.length >= 1) {

                    if (rnNoti) {
                        const description = rnNoti.createdBy.firstName + ' ' + rnNoti.createdBy.lastName + ' liked  your event post.';
                        let pic_path = '';
                        if (rnNoti.media) {
                            if (rnNoti.media.contentType.startsWith('video/')) {
                                pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id + '/thumbnail';
                            } else {
                                pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id + '/1.jpg';
                            }
                        }

                        const fn = new OneSignal.Notification({
                            headings: {
                                en: 'PetNetwork'
                            },
                            contents: {
                                en: description
                            },
                            priority: 10,
                            large_icon: SERVER_URL + '/owner/' + rnNoti.createdBy._id + '/profile_pic',
                            big_picture: pic_path,
                            include_player_ids: background_playerIds
                        });

                        try {
                            const push_response = await onesignal_client.sendNotification(fn);
                            console.log(push_response.data);
                        } catch (error) {
                            console.log(error);
                        }
                    }
                }

                return res.status(200).json({
                    message: "OK",
                });
            }

            return res.status(200).json({
                message: "OK"
            });
        }

        return res.status(404).json({
            message: "No valid entry found for provided event id"
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.uninterest_post = async (req, res, next) => {
    const eid = req.params.eid;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;

    try {
        const post = await Event.findById(eid);

        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);
            const interested_index = post.interested.indexOf(liker);

            //remove user id if it is found in interested list
            if (interested_index >= 0) {
                post.interested.splice(interested_index, 1);
                const rnPost = await post.save();

                if (rnPost) {
                    const interested = { id: rnPost._id, going: rnPost.going, interested: rnPost.interested };
                    //emits event interested to likes_socket subscriber
                    likes_socket.emit('event::reacted', interested);
                }

                return res.status(200).json({
                    message: 'OK'
                });
            }

            return res.status(200).json({
                message: 'OK'
            });
        }

        return res.status(404).json({
            message: 'No valid entry found for provided event id.'
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.ungoing_event = async (req, res, next) => {
    const eid = req.params.eid;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;

    try {
        const post = await Event.findById(eid);

        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);
            const going_index = post.going.indexOf(liker);

            //remove user id if it is found in going list
            if (going_index >= 0) {
                post.going.splice(going_index, 1);
                const rnPost = await post.save();

                if (rnPost) {
                    const going = { id: rnPost._id, going: rnPost.going, interested: rnPost.interested };
                    //emits event going to likes_socket subscriber
                    likes_socket.emit('event::reacted', going);
                }

                return res.status(200).json({
                    message: 'OK'
                });
            }

            return res.status(200).json({
                message: 'OK'
            });
        }

        return res.status(404).json({
            message: 'No valid entry found for provided event id.'
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.unlike_subpost = async (req, res, next) => {
    const seid = req.params.seid;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;

    try {
        const post = await SubEvent.findById(seid);

        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);
            const like_index = post.likes.indexOf(liker);
            //remove liker id if it is found in likes list
            if (like_index >= 0) {
                post.likes.splice(like_index, 1);
                const rnPost = await post.save();
                if (rnPost) {
                    const likes = { id: rnPost._id, likesCount: rnPost.likes.length };
                    //emits post likes to likes_socket subscriber
                    likes_socket.emit('subevent::reacted', likes);
                }

                return res.status(200).json({
                    message: 'OK'
                });
            }

            return res.status(200).json({
                message: 'OK'
            });
        }

        return res.status(404).json({
            message: 'No valid entry found for provided event id.'
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.comment_subpost = async (req, res, next) => {
    const {
        cmt_owner,
        commentor,
        comment_type,
        message
    } = req.body;

    const {
        likes_socket,
        noties_socket,
        onesignal_client
    } = req;

    let background_playerIds = [];

    //create new comment object
    let newCmt = new Comment(
        {
            _id: new mongoose.Types.ObjectId(),
            cmt_owner,
            commentor,
            comment_type,
            message
        }
    );
    newCmt.type = 'SUBEVENT';

    try {
        const rnCmt = await newCmt.save();

        const post = await SubEvent.findById(cmt_owner);

        if (post) {
            post.comments.push(rnCmt._id);
            const rnPost = await post.save();
            if (rnPost) {
                const cmt_count = { id: rnPost._id, cmtCount: rnPost.comments.length };
                //emits comment counts to likes_socket subscriber
                likes_socket.emit('subevent::commented', cmt_count);
            }

            const cmt = await Comment.findById(rnCmt._id)
                .populate('commentor', 'firstName lastName')
                .exec();

            //create notification model
            //noti type is COMMENT-SUBEVENT, so we put cmt_owner in dataId
            const newNoti = new Notification(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'COMMENT-SUBEVENT',
                    createdBy: commentor,
                    dataId: post.post_owner
                }
            );

            //add media id if it exits
            newNoti.media = post.media.length >= 1 ? post.media[0] : null;

            let noti = await newNoti.save();

            let rnNoti = await Notification.findById(noti._id)
                .populate('createdBy', 'firstName lastName')
                .populate('media', 'contentType')
                .exec();

            const noti_subscriber = getAllSubscriber(noties_socket);

            for (let i = 0, len = noti_subscriber.length; i < len; i++) {

                const { each_noti_socket, user_id } = noti_subscriber[i];

                //make sure not to send to own
                if (user_id === String(post.owner) && (user_id !== commentor)) {
                    rnNoti && each_noti_socket.emit('noti::created', rnNoti);
                }
            }

            const post_owner = await Owner.findById(post.owner);

            if (post_owner !== null && (String(post.owner) !== commentor)) {
                const playerIds = post_owner.playerIds;

                for (let j of playerIds) {
                    const { playerId, status } = j;
                    if (status === 'background' || status === 'inactive') {
                        background_playerIds.push(playerId);
                    }
                }

                post_owner.notiLists.push(noti._id);

                try {
                    const rnPostOwner = await post_owner.save();
                } catch (error) {
                    console.log("Can't save post_owner.");
                }
            }

            if (background_playerIds.length >= 1) {

                if (rnNoti) {
                    const description = rnNoti.createdBy.firstName + ' ' + rnNoti.createdBy.lastName + ' commented on your event post.';
                    let pic_path = '';
                    if (rnNoti.media) {
                        if (rnNoti.media.contentType.startsWith('video/')) {
                            pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id + '/thumbnail';
                        } else {
                            pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id;
                        }
                    }

                    const fn = new OneSignal.Notification({
                        headings: {
                            en: 'PetNetwork'
                        },
                        contents: {
                            en: description
                        },
                        priority: 10,
                        large_icon: SERVER_URL + '/users/' + rnNoti.createdBy._id + '/profile_pic',
                        big_picture: pic_path,
                        include_player_ids: background_playerIds
                    });

                    try {
                        const push_response = await onesignal_client.sendNotification(fn);
                        console.log(push_response.data);
                    } catch (error) {
                        console.log(error);
                    }
                }
            }

            return res.status(201).send(cmt);
        }

        return res.status(404).json({
            message: "No valid entry found for provided event id"
        });

    } catch (err) {
        return res.status(500).send(err);
    }
}

exports.get_comments = async (req, res, next) => {
    const page = req.query.page || 1;
    const eid = req.params.eid;

    // limit is 10 as default  in mongoose pagination
    const options = {
        sort: { createdAt: 1 },
        select: '-__v ',
        populate: [
            { path: 'commentor', select: 'firstName lastName' }
        ],
        page: page
    };

    try {
        const result = await Comment.paginate({ type: 'EVENT', cmt_owner: eid }, options);
        return res.status(200).send(result);
    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.get_subcomments = async (req, res, next) => {
    const page = req.query.page || 1;
    const seid = req.params.seid;

    // limit is 10 as default  in mongoose pagination
    const options = {
        sort: { createdAt: 1 },
        select: '-__v ',
        populate: [
            { path: 'commentor', select: 'firstName lastName' }
        ],
        page: page
    };

    try {
        const result = await Comment.paginate({ type: 'SUBEVENT', cmt_owner: seid }, options);
        return res.status(200).send(result);
    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.get_subpost_reactions = async (req, res) => {
    const seid = req.params.seid;
    const ownerId = req.body.ownerId;

    let post_likers = [];

    const user_id = new mongoose.Types.ObjectId(ownerId);

    try {
        const post = await SubEvent.findById(seid);

        if (post) {
            //for post likers
            const likers = await Owner.find({ _id: { $in: post.likes } });
            //very performant way to iterate in js
            //source :: https://stackoverflow.com/questions/5349425/whats-the-fastest-way-to-loop-through-an-array-in-javascript
            for (let i = 0, len = likers.length; i < len; i++) {
                const usr = await Owner.findById(likers[i]);
                if (usr) {
                    let owner_name = usr.firstName + ' ' + usr.lastName;
                    if (String(usr._id) === ownerId) {
                        post_likers.push({ ownerId: usr._id, status: 'You', name: owner_name });
                    } else if (usr.followerLists.indexOf(user_id) !== -1) {
                        post_likers.push({ ownerId: usr._id, status: 'Unfollow', name: owner_name });
                    } else if (usr.followerLists.indexOf(user_id) === -1) {
                        post_likers.push({ ownerId: usr._id, status: 'Follow', name: owner_name });
                    }
                }
            }

            return res.status(200).json(
                {
                    post_likers
                }
            );
        }

        return res.status(404).json({
            message: 'No valid entry found for provided event id.'
        });

    } catch (err) {
        return res.status(500).send(err);
    }
}

exports.create_post = async (req, res) => {
    const files = req.files || [];
    const onesignal_client = req.onesignal_client;

    const noties_socket = req.noties_socket;

    //playerIds of user whose app are in background state
    let background_playerIds = [];
    //to store permitted user ids of event
    let permitted_users = [];

    const {
        ownerId,
        description,
        event_name,
        start_date,
        start_time,
        end_date,
        end_time,
        locationData
    } = req.body;

    const start_date_array = start_date.split('-');
    const start_time_array = start_time.split(':');

    const end_date_array = end_date.split('-');
    const end_time_array = end_time.split(':');

    const event_start_date = new Date(start_date_array[0], start_date_array[1] - 1, start_date_array[2], start_time_array[0], start_time_array[1]);
    const event_end_date = new Date(end_date_array[0], end_date_array[1] - 1, end_date_array[2], end_time_array[0], end_time_array[1]);

    //init event model
    const event_model = new Event({ _id: new mongoose.Types.ObjectId() });
    event_model.owner = ownerId;
    event_model.event_name = event_name;
    event_model.start_date_time = event_start_date;
    event_model.end_date_time = event_end_date;

    //for event description
    if (description.trim().length !== 0) {
        event_model.description = description;
    }

    //for event location
    if (locationData) {
        const location = JSON.parse(locationData);
        if (location) {
            const loc_obj = {
                name: location.name,
                address: location.address,
                lat: location.latitude,
                lon: location.longitude
            };

            event_model.location = loc_obj;
        }
    }


    //for post media
    if (files && files.length > 0) {
        for (let f of files) {
            //init media model
            const media_model = new Media(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'EVENT'
                }
            );
            //check if it is image
            if (f.mimetype.startsWith('image/')) {
                if (f.mimetype === 'image/gif') {
                    const gif = await sharp(f.path).metadata();
                    //get gif metadata 
                    media_model.width = gif.width;
                    media_model.height = gif.height;
                    media_model.contentType = f.mimetype;
                    media_model.mediaUrl = f.filename;
                } else {
                    const imageName = Date.now() + '_compressed_' + f.originalname.split('.')[0] + '.jpeg';
                    const absolutePath = EVENT_URL + imageName;
                    const pic = await sharp(f.path).resize().jpeg({ quality: getPhotoQuality(f.size) }).toFile(absolutePath);
                    //get image metadata 
                    media_model.width = pic.width;
                    media_model.height = pic.height;
                    media_model.contentType = f.mimetype;
                    media_model.mediaUrl = imageName;
                    //finally delete original file
                    fs.unlink(f.path, (err) => {
                        if (err) console.log("Can't delete original file.");
                    });
                }
            }

            //finally save media model and push media id to citizen model
            const rnMedia = await media_model.save();
            event_model.media.push(rnMedia._id);
        }
    }

    try {
        const rnPost = await event_model.save();

        const final_post = await Event.findById(rnPost._id)
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .exec();

        if (final_post) {
            //create notification model
            //noti type is CREATE-EVENT, so we put event's rnPost._id in dataId
            let newNoti = new Notification(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'CREATE-EVENT',
                    createdBy: ownerId,
                    dataId: rnPost._id
                }
            );

            if (rnPost.media.length >= 1) {
                newNoti.media = rnPost.media[0];
            } else {
                newNoti.media = null;
            }

            const noti = await newNoti.save();

            let rnNoti = await Notification.findById(noti._id)
                .populate('createdBy', 'firstName lastName')
                .populate('media', 'contentType')
                .exec();

            const noti_subscriber = getAllSubscriber(noties_socket);

            //send noti via socket 
            for (let i = 0, len = noti_subscriber.length; i < len; i++) {

                const { each_noti_socket, user_id } = noti_subscriber[i];

                try {
                    //convert to mongo object id
                    const userTwo = new mongoose.Types.ObjectId(user_id);
                    //can't use permitted_users.includes(userTwo)
                    //see https://github.com/Automattic/mongoose/issues/6354
                    const index = permitted_users.indexOf(userTwo);
                    if (index > -1) {
                        rnNoti && each_noti_socket.emit('noti::created', rnNoti);
                    }
                } catch (err) {
                    console.log("Can't convert to mongo object id " + user_id);
                }
            }

            //send noti via one signal
            for (let j = 0, len = permitted_users.length; j < len; j++) {
                let follower = await Owner.findById(permitted_users[j]);

                if (follower) {
                    const playerIds = follower.playerIds;

                    for (let k of playerIds) {
                        const { playerId, status } = k;
                        if (status === 'background' || status === 'inactive') {
                            background_playerIds.push(playerId);
                        }
                    }

                    follower.notiLists.push(noti._id);
                    try {
                        const rnFollower = await follower.save();
                    } catch (error) {
                        console.log("Can't save follower user.");
                    }
                }
            }

            if (background_playerIds.length >= 1) {

                if (rnNoti) {
                    const description = rnNoti.createdBy.firstName + ' ' + rnNoti.createdBy.lastName + ' invited you in this event.';
                    let pic_path = '';
                    if (rnNoti.media) {
                        if (rnNoti.media.contentType.startsWith('video/')) {
                            pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id + '/thumbnail';
                        } else {
                            pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id + '/1.jpg';
                        }
                    }

                    const fn = new OneSignal.Notification({
                        headings: {
                            en: 'PetNetwork'
                        },
                        contents: {
                            en: description
                        },
                        priority: 10,
                        large_icon: SERVER_URL + '/owners/' + rnNoti.createdBy._id + '/profile_pic',
                        big_picture: pic_path,
                        include_player_ids: background_playerIds
                    });

                    try {
                        const push_response = await onesignal_client.sendNotification(fn);
                        console.log(push_response.data);
                    } catch (error) {
                        console.log(error);
                    }
                }
            }

            return res.status(201).send(final_post);
        }

        return res.status(404).json({
            message: "No valid entry found for provided event id"
        });

    } catch (e) {
        return res.status(500).json({
            error: e
        });
    }
}

exports.create_subpost = async (req, res, next) => {
    const files = req.files || [];
    const eid = req.params.eid;

    const noties_socket = req.noties_socket;
    const onesignal_client = req.onesignal_client;

    let background_playerIds = [];

    const {
        ownerId,
        description,
        locationData,
        postType
    } = req.body;

    console.log(req.body);

    const isPublic = postType === 'Public';

    //init subevent model
    const subevent_model = new SubEvent({ _id: new mongoose.Types.ObjectId() });
    subevent_model.owner = ownerId;
    subevent_model.post_owner = eid;
    subevent_model.isPublic = isPublic;

    //for post description
    if (description) {
        subevent_model.description = description;
    }

    //for post location
    if (locationData) {
        const location = JSON.parse(locationData);
        if (location) {
            const loc_obj = {
                name: location.name,
                address: location.address,
                lat: location.latitude,
                lon: location.longitude
            };
            subevent_model.location = loc_obj;
        }
    }

    //for post media
    if (files && files.length > 0) {
        for (let f of files) {
            //init media model
            const media_model = new Media(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'EVENT-SUBPOST'
                }
            );
            //check if it is image
            if (f.mimetype.startsWith('image/')) {
                if (f.mimetype === 'image/gif') {
                    const gif = await sharp(f.path).metadata();
                    //get gif metadata 
                    media_model.width = gif.width;
                    media_model.height = gif.height;
                    media_model.contentType = f.mimetype;
                    media_model.mediaUrl = f.filename;
                } else {
                    const imageName = Date.now() + '_compressed_' + f.originalname.split('.')[0] + '.jpeg';
                    const absolutePath = EVENT_URL + imageName;
                    const pic = await sharp(f.path).resize().jpeg({ quality: getPhotoQuality(f.size) }).toFile(absolutePath);
                    //get image metadata 
                    media_model.width = pic.width;
                    media_model.height = pic.height;
                    media_model.contentType = f.mimetype;
                    media_model.mediaUrl = imageName;
                    //finally delete original file
                    fs.unlink(f.path, (err) => {
                        if (err) console.log("Can't delete original file.");
                    });
                }
            } else if (f.mimetype.startsWith('video/')) {
                const videoName = Date.now() + '_compressed_' + f.originalname.split('.')[0] + '.mp4';
                const absolutePath = EVENT_URL + videoName;
                const thumbName = Date.now() + '_thumbnail_' + f.originalname.split('.')[0] + '.jpg';
                const videoProcess = await resizeVideo(f.path, 360, absolutePath);
                console.log(videoProcess);
                const thumbProcess = await getThumbnail(absolutePath, thumbName);
                //get video metadata and all videos are in 640x360 format 
                media_model.width = 640;
                media_model.height = 360;
                media_model.contentType = f.mimetype;
                media_model.mediaUrl = videoName;
                media_model.thumbnailUrl = thumbName;
                //finally delete original file
                fs.unlink(f.path, (err) => {
                    if (err) console.log("Can't delete original file.");
                });
            }

            //finally save media model and push media id to event model
            const rnMedia = await media_model.save();
            subevent_model.media.push(rnMedia._id);
        }
    }

    try {
        const rnPost = await subevent_model.save();
        //get populated post by event id
        const final_post = await SubEvent.findById(rnPost._id)
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .exec();

        if (final_post) {
            //create notification model
            //noti type is CREATE-SUBEVENT, so we put event's rnPost._id in dataId
            let newNoti = new Notification(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'CREATE-SUBEVENT',
                    createdBy: ownerId,
                    dataId: eid
                }
            );

            if (rnPost.media.length >= 1) {
                newNoti.media = rnPost.media[0];
            } else {
                newNoti.media = null;
            }

            const noti = await newNoti.save();

            let rnNoti = await Notification.findById(noti._id)
                .populate('createdBy', 'firstName lastName')
                .populate('media', 'contentType')
                .exec();

            let event = await Event.findById(eid);

            const noti_subscriber = getAllSubscriber(noties_socket);

            for (let i = 0, len = noti_subscriber.length; i < len; i++) {

                const { each_noti_socket, user_id } = noti_subscriber[i];

                //make sure not to send to own
                if (user_id === String(event.owner) && (String(event.owner) !== ownerId)) {
                    rnNoti && each_noti_socket.emit('noti::created', rnNoti);
                }
            }

            const post_owner = await Owner.findById(event.owner);

            if (post_owner !== null && String(event.owner) !== ownerId) {
                const playerIds = post_owner.playerIds;

                for (let j of playerIds) {
                    const { playerId, status } = j;
                    if (status === 'background' || status === 'inactive') {
                        background_playerIds.push(playerId);
                    }
                }

                post_owner.notiLists.push(noti._id);

                try {
                    const rnPostOwner = await post_owner.save();
                } catch (error) {
                    console.log("Can't save post_owner.");
                }
            }

            if (background_playerIds.length >= 1) {

                if (rnNoti) {
                    const description = rnNoti.createdBy.firstName + ' ' + rnNoti.createdBy.lastName + ' followed up on your post.';
                    let pic_path = '';
                    if (rnNoti.media) {
                        if (rnNoti.media.contentType.startsWith('video/')) {
                            pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id + '/thumbnail';
                        } else {
                            pic_path = SERVER_URL + '/events/media/' + rnNoti.media._id + '/1.jpg';
                        }
                    }

                    const fn = new OneSignal.Notification({
                        headings: {
                            en: 'PetNetwork'
                        },
                        contents: {
                            en: description
                        },
                        priority: 10,
                        large_icon: SERVER_URL + '/owners/' + rnNoti.createdBy._id + '/profile_pic',
                        big_picture: pic_path,
                        include_player_ids: background_playerIds
                    });

                    try {
                        const push_response = await onesignal_client.sendNotification(fn);
                        console.log(push_response.data);
                    } catch (error) {
                        console.log(error);
                    }
                }
            }
            //send created post
            return res.status(201).send(final_post);
        }

        return res.status(404).json({
            message: "No valid entry found for provided event id"
        });

    } catch (e) {
        return res.status(500).json({
            error: e
        });
    }
}

exports.get_photo = async (req, res, next) => {
    const mediaId = req.params.mediaId;

    try {
        const media = await Media.findById(mediaId);
        if (media) {
            const mediaUrl = EVENT_URL + media.mediaUrl;
            try {
                const file = await readFilePromise(mediaUrl);
                return res.status(200).send(file);
            } catch (error) {
                return res.status(404).json({
                    message: 'No such file'
                });
            }
        } else {
            return res.status(404).json({
                message: 'No valid entry found for provided ID'
            });
        }
    } catch (error) {
        return res.status(500).json({
            message: 'Internal server error'
        });
    }
}

exports.stream_video = async (req, res, next) => {
    const mediaId = req.params.mediaId;

    try {
        const media = await Media.findById(mediaId);
        if (media) {
            const mediaUrl = EVENT_URL + media.mediaUrl;
            fs.stat(mediaUrl, function (err, stats) {
                if (err) {
                    if (err.code === 'ENOENT') {
                        return res.status(404).send();
                    }
                }

                let start;
                let end;
                let total = 0;
                let contentRange = false;
                let contentLength = 0;

                let range = req.headers.range;
                if (range) {
                    let positions = range.replace(/bytes=/, "").split("-");
                    start = parseInt(positions[0], 10);
                    total = stats.size;
                    end = positions[1] ? parseInt(positions[1], 10) : total - 1;
                    let chunksize = (end - start) + 1;
                    contentRange = true;
                    contentLength = chunksize;
                } else {
                    start = 0;
                    end = stats.size;
                    contentLength = stats.size;
                }

                if (start <= end) {
                    let responseCode = 200;
                    res.setHeader('Accept-Ranges', 'bytes');
                    res.setHeader('Content-Length', contentLength);
                    res.setHeader('Content-Type', 'video/mp4');
                    if (contentRange) {
                        responseCode = 206;
                        res.setHeader('Content-Range', "bytes " + start + "-" + end + "/" + total);
                    }

                    res.statusCode = responseCode;

                    let stream = fs.createReadStream(mediaUrl, { start: start, end: end })
                        .on("readable", function () {
                            let chunk;
                            while (null !== (chunk = stream.read(1024))) {
                                res.write(chunk);
                            }
                        }).on("error", function (err) {
                            res.end(err);
                        }).on("end", function (err) {
                            res.end();
                        });
                } else {
                    res.statusCode = 403;
                    res.end();
                }
            });
        } else {
            res.statusCode = 404;
            res.end("No valid entry found for provided ID");
        }

    } catch (err) {
        res.statusCode = 500;
        res.end('Internal server error');
    }
}

exports.get_video_thumbnail = async (req, res, next) => {
    // media id of post
    const mediaId = req.params.mediaId;

    try {
        const media = await Media.findById(mediaId);

        if (media && media.contentType.startsWith('video/')) {
            const thumbUrl = THUMBNAIL_URL + media.thumbnailUrl;
            try {
                const file = await readFilePromise(thumbUrl);
                return res.status(200).send(file);
            } catch (error) {
                return res.status(404).json({
                    message: "No such file"
                });
            }
        }
        return res.status(404).json({
            message: "No valid entry found for provided ID"
        });

    } catch (err) {
        return res.status(500).json({
            error: err
        });
    }
}

exports.delete_event = async (req, res, next) => {

    const eId = req.params.eId;

    try {
        let saved_event = await Event.findById(eId).exec();

        if (saved_event) {

            saved_event.isAvailable = false;

            await saved_event.save();

            return res.status(200).json({ msg: 'OK' });

        }

        return res.status(404).json({ msg: 'No valid entry found for given id.' });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}
