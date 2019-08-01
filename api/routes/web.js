const express = require('express');
const router = express.Router();

const PostController = require('../controllers/posts');
const ArticleController = require('../controllers/articles');
const EventController = require('../controllers/events');

router.get('/posts/:postId', PostController.render_web_post);

router.get('/articles/:articleId', ArticleController.render_web_post);

router.get('/events/:eventId', EventController.render_web_post);

module.exports = router;