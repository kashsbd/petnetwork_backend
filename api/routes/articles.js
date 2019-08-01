const express = require('express');
const multer = require('multer');
const router = express.Router();

const ArticleController = require('../controllers/articles');
const checkAuth = require('../middlewares/check-auth');
const cache = require('../middlewares/cache-service');

const { ARTICLE_PIC_URL } = require('../config/config');

const storage = multer.diskStorage(
    {
        destination: function (req, file, cb) {
            cb(null, ARTICLE_PIC_URL);
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }
);

const fileFilter = function (req, file, cb) {
    const mimeType = file.mimetype;
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        return cb(null, true);
    }
    else
        return cb(new Error(mimeType + " file types are not allowed."), false);
}

const upload = multer(
    {
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: 524288000 // 500MB in bytes
        }
    }
);

//get all articles
router.get('/', checkAuth, ArticleController.get_all_articles);
//get article by id
router.get('/:arId', checkAuth, ArticleController.get_article_by_id);
//create new article
router.post('/', checkAuth, upload.array('media'), ArticleController.create_article);
//get photo by media id
router.get('/media/:mediaId', ArticleController.get_photo);
//get video thumbnail by media id
router.get('/media/:mediaId/thumbnail', ArticleController.get_video_thumbnail);
//like article
router.post('/:arId/like', checkAuth, ArticleController.like_article);
//unlike article
router.post('/:arId/unlike', checkAuth, ArticleController.unlike_article);
//comment article
router.post('/:arId/comments', checkAuth, ArticleController.comment_article);
//get all comments of specific article by article id
router.get('/:arId/comments', checkAuth, ArticleController.get_comments);
//get article reactions
router.post('/:arId/reactions', checkAuth, ArticleController.get_article_reactions);
//delete article
router.post('/:arId/delete', checkAuth, ArticleController.delete_article);

module.exports = router;