const express = require('express');
const router = express.Router();

const VetController = require('../controllers/vet');

router.get('/', VetController.get_all_vets);

router.post('/', VetController.create_vet);

module.exports = router;