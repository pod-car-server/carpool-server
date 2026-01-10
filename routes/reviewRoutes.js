//reviewRoutes.js
const express = require('express');
const router = express.Router();

// 1. Import Controller (Kiểm tra kỹ đường dẫn này)
const reviewController = require('../controllers/reviewController');

// 2. Import Middleware (Kiểm tra kỹ đường dẫn này)
const { verifyToken } = require('../middleware/authMiddleware');

// --- KIỂM TRA LỖI (Debug) ---
// Nếu dòng này in ra 'undefined', nghĩa là file controller chưa lưu hoặc sai tên
console.log("Kiem tra Controller:", reviewController.createReview); 
// -----------------------------

// 3. Định nghĩa Route
router.post('/', verifyToken, reviewController.createReview);


module.exports = router;