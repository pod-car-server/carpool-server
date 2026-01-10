// middleware/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. Kiểm tra và tạo thư mục 'uploads' nếu chưa có
// (Phần này giúp tránh lỗi nếu bạn quên tạo thư mục thủ công)
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// 2. Cấu hình nơi lưu và tên file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Ảnh sẽ lưu vào thư mục 'uploads'
    },
    filename: (req, file, cb) => {
        // Đặt tên file: image-thoigian-random.duoi
        // Xử lý tên file gốc: Chuyển tiếng Việt có dấu thành không dấu, xóa ký tự lạ
        const originalName = file.originalname
            .replace(/\s+/g, '-') // Thay khoảng trắng bằng gạch ngang
            .replace(/[^a-zA-Z0-9.\-_]/g, ''); // Bỏ các ký tự đặc biệt

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'image-' + uniqueSuffix + path.extname(originalName));
    }
});

// 3. Bộ lọc chỉ cho phép file ảnh
const fileFilter = (req, file, cb) => {
    // Chấp nhận các loại ảnh phổ biến (jpeg, jpg, png, gif...)
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, jpeg)!'), false);
    }
};

// 4. Khởi tạo Multer
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
    fileFilter: fileFilter
});

module.exports = upload;