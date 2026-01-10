// userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware'); 

// Route cập nhật token: PUT /api/users/push-token
router.put('/push-token', verifyToken, userController.updatePushToken);

module.exports = router;