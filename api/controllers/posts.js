const mongoose = require('mongoose');
const sharp = require('sharp');
const fs = require('fs');
const OneSignal = require('onesignal-node');
const readFilePromise = require('fs-readfile-promise');
const Post = require("../models/post");
const Owner = require('../models/owner')
const Status = require("../models/status");
const Media = require("../models/media");
const HashTag = require("../models/hashtag");
const Comment = require("../models/comment");
const Notification = require("../models/notification");

const { FEED_PIC_URL, THUMBNAIL_URL, SERVER_URL } = require('../config/config');
const { resizeVideo, getThumbnail } = require('../utils/convert-video');
const { getPhotoQuality } = require('../utils/calculate-photo-quality');
const { getAllSubscriber } = require('../utils/get-all-subscriber');

exports.get_all_posts = async (req, res, next) => {
    const page = req.query.page || 1;
    // limit is 10 as default  in mongoose pagination
    const options = {
        sort: { createdAt: -1 },
        select: '-__v',
        populate: [
            { path: 'owner', select: 'firstName lastName' },
            { path: 'hashTags', select: 'type hashTagString' },
            { path: 'media', select: 'width height contentType' },
            { path: 'status', select: 'type data' },
        ],
        page: page
    };
    try {
        const result = await Post.paginate({ isAvailable: true }, options);
        return res.status(200).send(result);
    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.get_post_by_id = async (req, res) => {

    const id = req.params.postId;

    try {
        const doc = await Post.find({ _id: id, isAvailable: true })
            .populate('owner', 'firstName lastName')
            .populate('hashTags', 'type hashTagString')
            .populate('media', 'width height contentType')
            .populate('status', 'type data')
            .exec();

        if (doc[0]) {
            return res.status(200).send(doc[0]);
        }

        return res.status(404).json({
            message: "No valid entry found for provided ID"
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.get_popular_posts = async (req, res) => {
    const page = req.query.page || 1;
    // limit is 10 as default  in mongoose pagination
    const options = {
        sort: { likes: -1 },
        select: '-__v ',
        populate: [
            { path: 'owner', select: 'firstName lastName' },
            { path: 'hashTags', select: 'type hashTagString' },
            { path: 'media', select: 'width height contentType' },
            { path: 'status', select: 'type data' }
        ],
        page: page
    };

    try {
        const result = await Post.paginate({ isAvailable: true }, options);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({
            error: err
        });
    }
}

exports.get_follower_posts = async (req, res, next) => {
    const page = req.query.page || 1;
    const ownerId = req.body.userId;
    let options = {
        sort: { createdAt: -1 },
        select: '-__v',
        populate: [
            { path: 'owner', select: 'firstName lastName' },
            { path: 'hashTags', select: 'type hashTagString' },
            { path: 'status', select: 'type data' },
            { path: 'media', select: 'width height contentType' }
        ],
        page: page
    };

    try {
        let onr = await Owner.findById(ownerId);
        if (onr) {
            const followingLists = onr.followingLists;
            if (followingLists.length > 0) {
                const following_posts_of_onr = await Post.paginate({ owner: { $in: followingLists }, isAvailable: true }, options);
                return res.status(200).send(following_posts_of_onr);
            }
            return res.status(200).send([]);
        }

    } catch (err) {
        return res.status(500).json({ error });
    }
}

exports.get_owner_posts = async (req, res, next) => {
    const page = req.query.page || 1;
    const ownerId = req.body.ownerId
    // limit is 10 as default  in mongoose pagination
    const options = {
        sort: { createdAt: -1 },
        select: '-__v',
        populate: [
            { path: 'owner', select: 'firstName lastName' },
            { path: 'hashTags', select: 'type hashTagString' },
            { path: 'media', select: 'width height contentType' },
            { path: 'status', select: 'type data' },
        ],
        page: page
    };

    try {
        const result = await Post.paginate({ owner: ownerId, isAvailable: true }, options);
        return res.status(200).send(result);
    } catch (error) {
        console.log(error)
        return res.status(500).send(error);
    }
}

exports.render_web_post = async (req, res) => {
    const postId = req.params.postId;
    let og_tags = [];

    try {
        let doc = await Post.findById(postId)
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .populate('status', 'data')
            .exec();

        if (doc && doc.isAvailable) {
            let rnDoc = JSON.parse(JSON.stringify(doc));
            rnDoc['type'] = 'POST';
            //check populated post and push to og_tags to use in ejs
            //og tag for status
            if (rnDoc.status && rnDoc.status.data) {
                og_tags.push({ tag_name: 'og:description', content: rnDoc.status.data.msg });
            }
            //og tags for media
            if (rnDoc.media.length > 0) {
                const first_media = rnDoc.media[0];
                if (first_media.contentType.startsWith('image/')) {
                    og_tags.push({ tag_name: 'og:image', content: SERVER_URL + '/posts/media/' + first_media._id });
                    og_tags.push({ tag_name: 'og:image:type', content: first_media.contentType });
                    og_tags.push({ tag_name: 'og:image:width', content: first_media.width });
                    og_tags.push({ tag_name: 'og:image:height', content: first_media.height });
                } else if (first_media.contentType.startsWith('video/')) {
                    og_tags.push({ tag_name: 'og:video', content: SERVER_URL + '/posts/media/' + first_media._id });
                    og_tags.push({ tag_name: 'og:video:type', content: first_media.contentType });
                    og_tags.push({ tag_name: 'og:video:width', content: first_media.width });
                    og_tags.push({ tag_name: 'og:video:height', content: first_media.height });
                }
            }

            const owner_name = rnDoc.owner.firstName + ' ' + rnDoc.owner.lastName;
            //og tags for title
            og_tags.push({ tag_name: 'og:title', content: owner_name + ' created a post on PetNetwork.' });

            return res.render('index', { og_tags });
        }

        return res.status(404).json({
            message: "No valid entry found for provided ID"
        });

    } catch (error) {
        console.log(error);
        return res.status(500).send(error);
    }
}

exports.like_post = async (req, res, next) => {

    const postId = req.params.postId;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;
    const noties_socket = req.noties_socket;
    const onesignal_client = req.onesignal_client;
    let background_playerIds = [];

    try {
        const post = await Post.findById(postId);
        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);

            //add liker id only if it is not found in likes list
            if (post.likes.indexOf(liker) === -1) {
                post.likes.push(liker);
                const rnPost = await post.save();
                if (rnPost) {
                    const likes = { id: rnPost._id, likesCount: rnPost.likes.length };
                    //emits post likes to likes_socket subscriber
                    likes_socket.emit('post::reacted', likes);
                }

                //create notification model
                //noti type is LIKE-POST, so we put postId in dataId
                const newNoti = new Notification(
                    {
                        _id: new mongoose.Types.ObjectId(),
                        type: 'LIKE-POST',
                        createdBy: ownerId,
                        dataId: postId
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

                    const { each_socket, owner_id } = noti_subscriber[i];

                    //make sure not to send to own
                    if ((owner_id === String(post.owner)) && (owner_id !== ownerId)) {

                        rnNoti && each_socket.emit('noti::created', rnNoti);
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
                        const description = rnNoti.createdBy.firstName + ' liked on your post.';
                        let pic_path = '';
                        if (rnNoti.media) {
                            if (rnNoti.media.contentType.startsWith('video/')) {
                                pic_path = SERVER_URL + '/posts/media/' + rnNoti.media._id + '/thumbnail';
                            } else {
                                pic_path = SERVER_URL + '/posts/media/' + rnNoti.media._id;
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
                            ///profile_pic/:ownerId"
                            large_icon: SERVER_URL + '/owners/profile_pic/' + rnNoti.createdBy._id,
                            big_picture: pic_path,
                            include_player_ids: background_playerIds,

                        });

                        try {
                            const push_response = await onesignal_client.sendNotification(fn);
                            console.log("like", push_response.data)
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
            message: "No valid entry found for provided post id"
        });

    } catch (error) {
        console.log(error)
        return res.status(500).send(error);
    }
}

exports.unlike_post = async (req, res, next) => {
    const postId = req.params.postId;
    const ownerId = req.body.ownerId;
    const likes_socket = req.likes_socket;

    try {
        const post = await Post.findById(postId);
        if (post) {
            const liker = new mongoose.Types.ObjectId(ownerId);
            const like_index = post.likes.indexOf(liker);

            //remove liker id if it is found in likes list
            if (like_index >= 0) {
                post.likes.splice(like_index, 1);
                let rnPost = await post.save();

                if (rnPost) {
                    const likes = { id: rnPost._id, likesCount: rnPost.likes.length };
                    //emits post likes to likes_socket subscriber
                    likes_socket.emit('post::reacted', likes);
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
            message: 'No valid entry found for provided post id.'
        });

    } catch (error) {
        console.log('error', error)
        return res.status(500).send(error);
    }
}

exports.undislike_post = async (req, res, next) => {

    const postId = req.params.postId;
    const userId = req.body.userId;

    const likes_socket = req.likes_socket;

    try {
        const post = await Post.findById(postId);
        if (post) {
            const disliker = new mongoose.Types.ObjectId(userId);
            const dislike_index = post.dislikes.indexOf(disliker);
            //remove disliker id if it is found in dislikes list
            if (dislike_index >= 0) {
                post.dislikes.splice(dislike_index, 1);
                const rnPost = await post.save();
                if (rnPost) {
                    const dislikes = { id: rnPost._id, likesCount: rnPost.likes.length, dislikesCount: rnPost.dislikes.length };
                    //emits post dislikes to likes_socket subscriber
                    likes_socket.emit('post::reacted', dislikes);
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
            message: 'No valid entry found for provided post id.'
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.comment_post = async (req, res, next) => {

    const {
        type,
        cmt_owner,
        commentor,
        comment_type,
        message
    } = req.body;

    const likes_socket = req.likes_socket;

    const noties_socket = req.noties_socket;

    const onesignal_client = req.onesignal_client;

    let background_playerIds = [];

    //create new comment object
    const newCmt = new Comment(
        {
            _id: new mongoose.Types.ObjectId(),
            type,
            cmt_owner,
            commentor,
            comment_type,
            message
        }
    );

    try {
        const rnCmt = await newCmt.save();
        const post = await Post.findById(cmt_owner);

        if (post) {
            post.comments.push(rnCmt._id);
            const rnPost = await post.save();
            if (rnPost) {
                const cmt_count = { id: rnPost._id, cmtCount: rnPost.comments.length };
                //emits comment counts to likes_socket subscriber
                likes_socket.emit('post::commented', cmt_count);
            }

            const cmt = await Comment.findById(rnCmt._id)
                .populate('commentor', 'firstName lastName')
                .exec();
            //create notification model
            //noti type is COMMENT-POST, so we put cmt_owner in dataId
            const newNoti = new Notification(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'COMMENT-POST',
                    createdBy: commentor,
                    dataId: cmt_owner
                }
            );

            //add media id if it exits
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

                const { each_socket, owner_id } = noti_subscriber[i];

                //make sure not to send to own
                if (owner_id === String(post.user) && (owner_id !== commentor)) {

                    rnNoti && each_socket.emit('noti::created', rnNoti);
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
                    const description = rnNoti.createdBy.firstName + ' commented on your post.';
                    let pic_path = '';
                    if (rnNoti.media) {
                        if (rnNoti.media.contentType.startsWith('video/')) {
                            pic_path = SERVER_URL + '/posts/media/' + rnNoti.media._id + '/thumbnail';
                        } else {
                            pic_path = SERVER_URL + '/posts/media/' + rnNoti.media._id;
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
                        ///profile_pic/:ownerId"
                        large_icon: SERVER_URL + '/owners/profile_pic/' + rnNoti.createdBy._id,
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

        return res.status(404).json(
            {
                message: "No valid entry found for provided post id"
            }
        );

    } catch (err) {
        console.log("errrr", err)
        return res.status(500).send(err);
    }
}

exports.get_comments = async (req, res, next) => {
    const page = req.query.page || 1;
    const postId = req.params.postId;

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
        const result = await Comment.paginate({ type: 'POST', cmt_owner: postId }, options);
        return res.status(200).send(result);
    } catch (error) {
        return res.status(500).send(error);
    }
}


exports.get_post_reactions = async (req, res, next) => {
    const postId = req.params.postId;
    const userId = req.body.userId;

    let post_likers = [];

    const user_id = new mongoose.Types.ObjectId(userId);

    try {
        const post = await Post.findById(postId);

        if (post) {
            //for post likers
            const likers = await Owner.find({ _id: { $in: post.likes } });
            //very performant way to iterate in js
            //source :: https://stackoverflow.com/questions/5349425/whats-the-fastest-way-to-loop-through-an-array-in-javascript
            for (let i = 0, len = likers.length; i < len; i++) {
                const usr = await Owner.findById(likers[i]);
                if (usr) {
                    if (String(usr._id) === userId) {
                        post_likers.push({ userId: usr._id, status: 'You', name: usr.firstName + " " + usr.lastName });
                    } else if (usr.followerLists.indexOf(user_id) !== -1) {
                        post_likers.push({ userId: usr._id, status: 'Unfollow', name: usr.firstName + " " + usr.lastName });
                    } else if (usr.followerLists.indexOf(user_id) === -1) {
                        post_likers.push({ userId: usr._id, status: 'Follow', name: usr.firstName + " " + usr.lastName });
                    }
                }
            }

            return res.status(200).json(
                {
                    post_likers,

                }
            );
        }

        return res.status(404).json({
            message: 'No valid entry found for provided post id.'
        });

    } catch (err) {
        return res.status(500).send(err);
    }
}

exports.create_post = async (req, res, next) => {
    const files = req.files || [];
    const onesignal_client = req.onesignal_client;
    let uploadedInfo = JSON.parse(req.body.uploadInfo)

    const all_posts_socket = req.all_posts_socket;
    const follower_posts_socket = req.follower_posts_socket;
    const noties_socket = req.noties_socket;
    const ownerId = uploadedInfo.ownerId;
    const json_status = uploadedInfo.description;
    const raw_hash_tags = uploadedInfo.hashtag;

    //playerIds of user whose app are in background state
    let background_playerIds = [];

    //init post model
    const post_model = new Post({ _id: new mongoose.Types.ObjectId() });
    post_model.owner = ownerId;
    post_model.petName = uploadedInfo.petName;
    post_model.activity = uploadedInfo.activity

    //for hash tag
    try {
        if (raw_hash_tags) {
            const hash_tags = raw_hash_tags.split(',');
            if (hash_tags && hash_tags.length > 0) {
                for (let h of hash_tags) {
                    const hashtag_model = new HashTag(
                        {
                            _id: new mongoose.Types.ObjectId(),
                            type: 'POST',
                            hashtag_owner: post_model._id,
                            hashTagString: h
                        }
                    );

                    const rnHashTag = await hashtag_model.save();
                    post_model.hashTags.push(rnHashTag._id);
                }
            }
        }

        //for status
        if (json_status) {

            const status_model = new Status(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'TEXT',
                    data: { mediaName: null, msg: json_status }
                }
            );

            const rnStatus = await status_model.save();

            post_model.status = rnStatus._id;
        }

        //for post media
        if (files && files.length > 0) {
            for (let f of files) {
                //init media model
                const media_model = new Media(
                    {
                        _id: new mongoose.Types.ObjectId(),
                        type: 'POST'
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
                        const absolutePath = FEED_PIC_URL + imageName;
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
                    const absolutePath = FEED_PIC_URL + videoName;
                    const thumbName = Date.now() + '_thumbnail_' + f.originalname.split('.')[0] + '.jpg';
                    const videoProcess = await resizeVideo(f.path, 360, absolutePath);

                    const thumbProcess = await getThumbnail(absolutePath, thumbName);
                    //get video metadata and all videos are in 640x360 format 
                    media_model.width = 640;
                    media_model.height = 360;
                    media_model.type = 'POST';
                    media_model.contentType = f.mimetype;
                    media_model.mediaUrl = videoName;
                    media_model.thumbnailUrl = thumbName;
                    //finally delete original file
                    fs.unlink(f.path, (err) => {
                        if (err) console.log("Can't delete original file.");
                    });
                }

                //finally save media model and push media id to post model
                const rnMedia = await media_model.save();
                post_model.media.push(rnMedia._id);
            }
        }


        const rnPost = await post_model.save();
        //get populated post by post id
        const final_post = await Post.findById(rnPost._id)
            .populate('owner', 'firstName lastName')
            .populate('hashTags', 'type hashTagString')
            .populate('media', 'width height contentType')
            .populate('status', 'type data')
            .exec();

        //get user by userId
        const rnOwner = await Owner.findById(ownerId);

        if (final_post) {

            if (rnOwner) {
                //get all friend lists of user
                const friendLists = rnOwner.followerLists;
                //all socket ids who subscribe to /follower_posts
                const all_follower_clients = Object.keys(follower_posts_socket.connected);
                for (let each_socket_id of all_follower_clients) {
                    //get socket obj from socket id
                    const each_follower_socket = follower_posts_socket.connected[each_socket_id];
                    //get user id from socket.io query
                    const user_id = each_follower_socket.handshake.query.userId;
                    try {
                        //convert to mongo object id
                        const userTwo = new mongoose.Types.ObjectId(user_id);
                        //can't use friendLists.includes(userTwo)
                        //see https://github.com/Automattic/mongoose/issues/6354
                        if (friendLists.indexOf(userTwo) > -1) {
                            each_follower_socket.emit('post::created', final_post);
                        }
                    } catch (err) {
                        console.log("Can't convert to mongo object id " + user_id);
                    }
                }
            }

            //create notification model
            //noti type is CREATE-POST, so we put post_model._id in dataId
            const newNoti = new Notification(
                {
                    _id: new mongoose.Types.ObjectId(),
                    type: 'CREATE-POST',
                    createdBy: ownerId,
                    dataId: post_model._id
                }
            );

            //add media id if it exits
            if (final_post.media.length >= 1) {
                newNoti.media = final_post.media[0]._id;
            } else {
                newNoti.media = null;
            }

            const noti = await newNoti.save();

            let rnNoti = await Notification.findById(noti._id)
                .populate('createdBy', 'firstName lastName')
                .populate('media', 'contentType')
                .exec();

            const followerLists = rnOwner.followerLists;

            const noti_subscriber = getAllSubscriber(noties_socket);

            for (let i = 0, len = noti_subscriber.length; i < len; i++) {

                const { each_socket, owner_id } = noti_subscriber[i];

                try {
                    //convert to mongo object id
                    const userTwo = new mongoose.Types.ObjectId(owner_id);

                    const index = followerLists.indexOf(userTwo);
                    if (index > -1) {
                        rnNoti && each_socket.emit('noti::created', rnNoti);
                    }
                } catch (err) {
                    console.log("Can't convert to mongo object id " + owner_id);
                }
            }

            for (let j = 0, len = followerLists.length; j < len; j++) {
                let follower = await Owner.findById(followerLists[j]);

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
                    const description = rnNoti.createdBy.firstName + ' created a new post.';
                    let pic_path = '';
                    if (rnNoti.media) {
                        if (rnNoti.media.contentType.startsWith('video/')) {
                            pic_path = SERVER_URL + '/posts/media/' + rnNoti.media._id + '/thumbnail';
                        } else {
                            pic_path = SERVER_URL + '/posts/media/' + rnNoti.media._id;
                        }
                    }

                    const fn = new OneSignal.Notification({
                        headings: {
                            en: 'Petnetwork'
                        },
                        contents: {
                            en: description
                        },
                        priority: 10,
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
            //send created post
            return res.status(201).send(final_post);
        }

        return res.status(404).json({
            message: "No valid entry found for provided post id"
        });

    } catch (error) {
        return res.status(500).json({ error });
    }
}

exports.get_photo = async (req, res, next) => {
    const mediaId = req.params.mediaId;

    try {
        const media = await Media.findById(mediaId);
        if (media) {
            const mediaUrl = FEED_PIC_URL + media.mediaUrl;
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
            const mediaUrl = FEED_PIC_URL + media.mediaUrl;
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

exports.delete_post = async (req, res, next) => {

    const postId = req.params.postId;

    try {
        let saved_post = await Post.findById(postId).exec();

        if (saved_post) {

            saved_post.isAvailable = false;

            await saved_post.save();

            return res.status(200).json({ msg: 'OK' });

        }

        return res.status(404).json({ msg: 'No valid entry found for given id.' });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}

exports.update_post = (req, res, next) => {

}