const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// 👇 ĐIỀN THÔNG TIN CLOUDINARY CỦA BẠN VÀO ĐÂY
cloudinary.config({
    cloud_name: 'dj1llyjig',
    api_key: '816921391676264',
    api_secret: 'ORriBjojRj_UWSt-QO6vrvynvV4'
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'carpool_app', // Tên thư mục trên Cloudinary
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }] // Tự động resize ảnh cho nhẹ
    },
});

const uploadCloud = multer({ storage: storage });

module.exports = uploadCloud;