const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // SSL chỉ bật khi lên Production (Render/Heroku/Neon)
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    // console.log('Đã kết nối tới Database'); // Có thể bỏ comment nếu muốn log
});

pool.on('error', (err, client) => {
    console.error('Lỗi kết nối Database bất ngờ:', err);
    // Không exit process để tránh crash server khi mạng chập chờn
});

module.exports = pool;