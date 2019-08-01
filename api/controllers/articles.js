const mongoose = require('mongoose');
const sharp = require('sharp');
const fs = require('fs');
const readFilePromise = require('fs-readfile-promise');
const Article = require("../models/article");
const Owner = require('../models/owner')
const Media = require("../models/media");
const Comment = require("../models/comment");

const { ARTICLE_PIC_URL, SERVER_URL, THUMBNAIL_URL } = require('../config/config');
const { getPhotoQuality } = require('../utils/calculate-photo-quality');
const { resizeVideo, getThumbnail } = require('../utils/convert-video');

exports.get_all_articles = async (req, res) => {
    const page = req.query.page || 1;
    // limit is 10 as default  in mongoose pagination
    const options = {
        sort: { createdAt: -1 },
        select: '-__v',
        populate: [
            { path: 'owner', select: 'firstName lastName' },
            { path: 'media', select: 'width height contentType' }
        ],
        page: page
    };

    try {
        const result = await Article.paginate({ isAvailable: true }, options);
        return res.status(200).send(result);
    } catch (error) {
        console.log(error);
        return res.status(500).send(error);
    }
}

exports.get_article_by_id = async (req, res) => {
    const id = req.params.arId;

    try {
        const doc = await Article.find({ _id: id, isAvailable: true })
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .exec();

        if (doc[0]) {
            return res.status(200).send(doc[0]);
        }

        return res.status(404).json({
            message: "No valid entry found for provided ID"
        });

    } catch (error) {
        console.log(error);
        return res.status(500).send(error);
    }
}

exports.render_web_post = async (req, res) => {
    const articleId = req.params.articleId;
    let og_tags = [];

    try {
        let doc = await Article.findById(articleId)
            .populate('owner', 'firstName lastName')
            .populate('media', 'width height contentType')
            .exec();

        if (doc && doc.isAvailable) {
            let rnDoc = JSON.parse(JSON.stringify(doc));
            rnDoc['type'] = 'ARTICLE';
            //check populated post and push to og_tags to use in ejs
            //og tag for status
            if (rnDoc.description) {
                og_tags.push({ tag_name: 'og:description', content: rnDoc.description });
            }

            //og tags for media
            if (rnDoc.media) {
                const first_media = rnDoc.media;
                og_tags.push({ tag_name: 'og:image', content: SERVER_URL + '/articles/media/' + first_media._id });
                og_tags.push({ tag_name: 'og:image:type', content: first_media.contentType });
                og_tags.push({ tag_name: 'og:image:width', content: first_media.width });
                og_tags.push({ tag_name: 'og:image:height', content: first_media.height });
            }

            const owner_name = rnDoc.owner.firstName + ' ' + rnDoc.owner.lastName;
            //og tags for title
            og_tags.push({ tag_name: 'og:title', content: owner_name + ' created an article on PetNetwork.' });

            return res.render('index', { og_tags });
        }

        return res.status(404).json({
            message: "No valid entry found for provided ID"
        });

    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.create_article = async (req, res) => {
    const files = req.files || [];
    const { ownerId, title, description } = req.body;

    //init article model
    const article_model = new Article({ _id: new mongoose.Types.ObjectId() });
    article_model.owner = ownerId;
    article_model.title = title;
    article_model.description = description;

    try {
        //for article media
        if (files && files.length > 0) {
            for (let f of files) {
                //init media model
                const media_model = new Media(
                    {
                        _id: new mongoose.Types.ObjectId(),
                        type: 'ARTICLE'
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
                        const absolutePath = ARTICLE_PIC_URL + imageName;
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
                    const absolutePath = ARTICLE_PIC_URL + videoName;
                    const thumbName = Date.now() + '_thumbnail_' + f.originalname.split('.')[0] + '.jpg';
                    const videoProcess = await resizeVideo(f.path, 360, absolutePath);

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
                //finally save media model and push media id to article model
                const rnMedia = await media_model.save();
                article_model.media = rnMedia._id;
            }
        }

        await article_model.save();

        return res.status(201).json({ msg: 'OK' });

    } catch (error) {
        console.log("create article error", error)
        return res.status(500).json({ error });
    }
}

exports.like_article = async (req, res) => {
    const arId = req.params.arId;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;

    try {
        const article = await Article.findById(arId).exec();

        if (article) {
            const liker = new mongoose.Types.ObjectId(ownerId);

            //add liker id only if it is not found in likes list
            if (article.likes.indexOf(liker) === -1) {
                article.likes.push(liker);

                const rnArticle = await article.save();

                if (rnArticle) {
                    const likes = { id: rnArticle._id, likesCount: rnArticle.likes.length };
                    //emits article likes to likes_socket subscriber
                    likes_socket.emit('article::reacted', likes);
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

exports.unlike_article = async (req, res) => {
    const arId = req.params.arId;
    const ownerId = req.body.ownerId;

    const likes_socket = req.likes_socket;

    try {
        const article = await Article.findById(arId).exec();

        if (article) {
            const liker = new mongoose.Types.ObjectId(ownerId);

            const like_index = article.likes.indexOf(liker);

            //remove liker id if it is found in likes list
            if (like_index >= 0) {
                article.likes.splice(like_index, 1);

                const rnArticle = await article.save();

                if (rnArticle) {
                    const likes = { id: rnArticle._id, likesCount: rnArticle.likes.length };
                    //emits article likes to likes_socket subscriber
                    likes_socket.emit('article::reacted', likes);
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

exports.comment_article = async (req, res) => {

    const {
        type,
        cmt_owner,
        commentor,
        comment_type,
        message
    } = req.body;

    const likes_socket = req.likes_socket;

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

        const article = await Article.findById(cmt_owner).exec();

        if (article) {

            article.comments.push(rnCmt._id);

            const rnArticle = await article.save();

            if (rnArticle) {
                const cmt_count = { id: rnArticle._id, cmtCount: rnArticle.comments.length };
                //emits comment counts to likes_socket subscriber
                likes_socket.emit('article::commented', cmt_count);
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

exports.get_comments = async (req, res) => {
    const page = req.query.page || 1;
    const arId = req.params.arId;

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
        const result = await Comment.paginate({ type: 'ARTICLE', cmt_owner: arId }, options);
        return res.status(200).send(result);
    } catch (error) {
        return res.status(500).send(error);
    }
}

exports.get_article_reactions = async (req, res) => {
    const arId = req.params.arId;
    const ownerId = req.body.ownerId;

    let article_likers = [];

    const user_id = new mongoose.Types.ObjectId(ownerId);

    try {
        const article = await Article.findById(arId).exec();

        if (article) {
            const likers = await Owner.find({ _id: { $in: article.likes } });

            for (let i = 0, len = likers.length; i < len; i++) {

                const usr = await Owner.findById(likers[i]).exec();

                if (usr) {
                    if (String(usr._id) === ownerId) {
                        article_likers.push({ ownerId: usr._id, status: 'You', name: usr.firstName + " " + usr.lastName });
                    } else if (usr.followerLists.indexOf(user_id) !== -1) {
                        article_likers.push({ ownerId: usr._id, status: 'Unfollow', name: usr.firstName + " " + usr.lastName });
                    } else if (usr.followerLists.indexOf(user_id) === -1) {
                        article_likers.push({ ownerId: usr._id, status: 'Follow', name: usr.firstName + " " + usr.lastName });
                    }
                }
            }

            return res.status(200).json({ article_likers });
        }

        return res.status(404).json({
            message: 'No valid entry found for provided post id.'
        });

    } catch (err) {
        console.log(err);
        return res.status(500).send(err);
    }
}

exports.get_photo = async (req, res) => {
    const mediaId = req.params.mediaId;

    try {
        const media = await Media.findById(mediaId).exec();

        if (media) {
            const mediaUrl = ARTICLE_PIC_URL + media.mediaUrl;

            try {
                const file = await readFilePromise(mediaUrl);
                return res.status(200).send(file);
            } catch (error) {
                return res.status(404).json({ message: 'No such file' });
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
            const mediaUrl = ARTICLE_PIC_URL + media.mediaUrl;
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

exports.get_video_thumbnail = async (req, res) => {
    // media id of post
    const mediaId = req.params.mediaId;

    try {
        const media = await Media.findById(mediaId).exec();

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

exports.delete_article = async (req, res, next) => {
    const arId = req.params.arId;

    try {
        let saved_article = await Article.findById(arId).exec();

        if (saved_article) {

            saved_article.isAvailable = false;

            await saved_article.save();

            return res.status(200).json({ msg: 'OK' });

        }

        return res.status(404).json({ msg: 'No valid entry found for given id.' });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error });
    }
}