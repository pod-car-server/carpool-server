const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: 'dj1llyjig',
    api_key: '816921391676264',
    api_secret: 'ORriBjojRj_UWSt-QO6vrvynvV4'
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'carpool_uploads', // Tên thư mục trên Cloudinary
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }] // Tự động nén ảnh
    },
});

const uploadCloud = multer({ storage });

module.exports = uploadCloud;