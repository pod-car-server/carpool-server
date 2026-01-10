const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const pool = require('./config/db');
const os = require('os'); 
const http = require('http');
const { Server } = require('socket.io');

// --- IMPORT ROUTES ---
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const tripRoutes = require('./routes/tripRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const profileRoutes = require('./routes/profileRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
// 👇 ROUTE ADMIN & VÍ
const adminRoutes = require('./routes/adminRoutes');
const walletRoutes = require('./routes/walletRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Tạo HTTP Server và Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Lưu biến io vào app (để dùng kiểu req.app.get('io') nếu cần)
app.set('io', io); 

// --- MIDDLEWARE CHUNG ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('dev'));

// 👇👇👇 QUAN TRỌNG: GÁN SOCKET VÀO REQUEST (REQ) 👇👇👇
app.use((req, res, next) => {
    req.io = io; 
    next();
});
// 👆👆👆 

// Cấu hình thư mục Uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static(uploadDir));

// Biến lưu trữ tạm thời các tài xế online (Trong RAM)
const activeDrivers = new Map();

// --- SOCKET LOGIC ---
io.on("connection", (socket) => {
    console.log("⚡ Client Socket kết nối ID:", socket.id);

    // 1. Tài xế vào phòng
    socket.on("join_driver_room", (driverId) => {
        const roomName = `driver_${driverId}`;
        socket.join(roomName);
        console.log(`🚕 Tài xế ID ${driverId} đã vào phòng riêng: ${roomName}`);
    });

    // 2. User vào phòng
    socket.on("join_user_room", (userId) => {
        const roomName = `user_${userId}`;
        socket.join(roomName);
    });

    // 3. Vào phòng chuyến đi
    socket.on("join_trip_room", (tripId) => {
        if (!tripId) return;
        const roomName = `trip_${String(tripId)}`; 
        socket.join(roomName);
        console.log(`🗺️ Socket ${socket.id} vào phòng chuyến đi: ${roomName}`);
    });

    // 4. Admin vào phòng giám sát
    socket.on("join_admin_room", () => {
        socket.join("admin_room");
        
        // Gửi ngay danh sách tài xế online cho Admin
        const driversList = Array.from(activeDrivers.values());
        socket.emit("initial_active_drivers", driversList);
        console.log("👮 Admin đã vào phòng giám sát (admin_room).");
    });

    // 5. Nhận vị trí từ TÀI XẾ -> Gửi cho Admin & Khách
    socket.on("send_location", (data) => {
        const driverId = data.user_id || socket.id;

        // Lưu vào RAM
        activeDrivers.set(driverId, {
            ...data,
            id: driverId,
            socket_id: socket.id,
            last_update: new Date()
        });

        // Gửi cho Admin (Live Map)
        io.to("admin_room").emit("update_driver_location", {
            id: driverId,
            ...data
        });

        // Gửi cho Khách (trong chuyến đi)
        if (data.trip_id) {
            const roomName = `trip_${String(data.trip_id)}`; 
            io.to(roomName).emit("receive_location", data);
        }
    });

        // Nhận từ Khách -> Gửi cho Tài xế
    socket.on("send_passenger_location", (data) => {
        if (!data.trip_id) return;
        const roomName = `trip_${String(data.trip_id)}`;
        io.to(roomName).emit("receive_passenger_location", data);
    });

    // 7. Ngắt kết nối
    socket.on("disconnect", () => {
        for (let [id, driver] of activeDrivers.entries()) {
            if (driver.socket_id === socket.id) {
                activeDrivers.delete(id);
                io.to("admin_room").emit("driver_disconnected", id);
                console.log(`🔴 Tài xế ${driver.plate_number || id} đã offline.`);
                break;
            }
        }
    });
});

// --- DEFINITIONS ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);

// Routes Admin & Ví
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes); 

// Error Handler
app.use((err, req, res, next) => {
    console.error("Lỗi Server:", err.stack);
    res.status(500).json({ success: false, message: 'Lỗi Server' });
});

// Hàm lấy IP mạng LAN
const getLocalIpAddress = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
};

// Khởi động Server
pool.connect().then(() => {
    console.log('✅ DB Connected');
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server đang chạy tại: http://${getLocalIpAddress()}:${PORT}`);
        console.log(`📡 Socket.io đã sẵn sàng.`);
    });
}).catch(err => console.error('❌ DB Error:', err.message));