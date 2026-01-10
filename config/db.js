const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Cấu hình kết nối thông minh
const connectionConfig = {
    // SSL: Bắt buộc bật trên Render/Neon để không bị lỗi bảo mật
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// LOGIC QUAN TRỌNG:
// Nếu có DATABASE_URL (trên Render) -> Dùng connectionString
// Nếu không (trên máy Local) -> Dùng các biến lẻ (DB_USER, DB_HOST...)
if (process.env.DATABASE_URL) {
    connectionConfig.connectionString = process.env.DATABASE_URL;
} else {
    connectionConfig.user = process.env.DB_USER;
    connectionConfig.host = process.env.DB_HOST;
    connectionConfig.database = process.env.DB_DATABASE;
    connectionConfig.password = process.env.DB_PASSWORD;
    connectionConfig.port = process.env.DB_PORT;
}

const pool = new Pool(connectionConfig);

pool.on('connect', () => {
   // console.log('Đã kết nối tới Database'); 
});

pool.on('error', (err, client) => {
    console.error('Lỗi kết nối Database bất ngờ:', err);
});

module.exports = pool;