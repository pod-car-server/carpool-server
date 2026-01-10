const pool = require('../config/db');

// Hàm hỗ trợ xóa dấu tiếng Việt phía Code (Dùng cho tham số đầu vào)
const removeAccents = (str) => {
    if (!str) return '';
    return str.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd').replace(/Đ/g, 'D');
};

// 1. TẠO CHUYẾN XE (Đã thêm kiểm tra Khóa & Realtime Socket)
exports.createTrip = async (req, res) => {
    // 👇 Lấy thêm total_seats từ body
    const { origin, destination, departure_time, price, total_seats } = req.body;
    const driver_id = req.user.id;

    if (!origin || !destination || !departure_time || !price || !total_seats) {
        return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin chuyến đi." });
    }

    try {
        // 1. Lấy thông tin xe VÀ TRẠNG THÁI để kiểm tra
        const vehicleRes = await pool.query(
            "SELECT seats, status FROM vehicles WHERE driver_id = $1", 
            [driver_id]
        );
        
        if (vehicleRes.rows.length === 0) {
            return res.status(400).json({ message: "Bạn chưa đăng ký xe. Vui lòng cập nhật thông tin phương tiện." });
        }

        const vehicle = vehicleRes.rows[0];
        const realVehicleSeats = vehicle.seats; // Ví dụ xe thật: 7 chỗ
        
        // 👇👇👇 🔴 LOGIC CHẶN TÀI XẾ (QUAN TRỌNG) 👇👇👇
        if (vehicle.status === 'blocked') {
            return res.status(403).json({ 
                success: false, 
                message: "Tài khoản của bạn đã bị KHÓA. Vui lòng liên hệ Admin để mở lại." 
            });
        }

        if (vehicle.status === 'pending') {
            return res.status(403).json({ 
                success: false, 
                message: "Hồ sơ xe đang CHỜ DUYỆT. Bạn chưa thể tạo chuyến đi lúc này." 
            });
        }
        // 👆👆👆 HẾT PHẦN KIỂM TRA TRẠNG THÁI 👆👆👆

        // 2. LOGIC KIỂM TRA SỐ GHẾ
        if (parseInt(total_seats) > realVehicleSeats) {
            return res.status(400).json({ 
                success: false,
                message: `Xe của bạn chỉ có ${realVehicleSeats} chỗ. Không thể đăng ký ${total_seats} chỗ.` 
            });
        }

        // 3. TÍNH TOÁN SỐ GHẾ CHUẨN
        const initialAvailable = parseInt(total_seats) - 1;

        // 4. INSERT VÀO DB
        const result = await pool.query(
            `INSERT INTO trips (driver_id, origin, destination, departure_time, price, total_seats, available_seats, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled') RETURNING *`,
            [driver_id, origin, destination, departure_time, price, total_seats, initialAvailable]
        );

        const newTrip = result.rows[0];

        // 👇👇👇 🚀 KÍCH HOẠT SOCKET REALTIME CHO ADMIN 👇👇👇
        if (req.io) {
            req.io.emit("server_update_trips", { 
                message: "Có chuyến xe mới vừa được đăng!", 
                trip_id: newTrip.id 
            });
        }

        res.status(201).json({ success: true, message: "Tạo chuyến thành công!", trip: newTrip });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};


// 2. TÌM KIẾM CHUYẾN XE THÔNG MINH (BỎ DẤU, BỎ CÁCH, BỎ HOA - DÙNG UNACCENT)
exports.searchTrips = async (req, res) => {
    const { origin, destination, date } = req.query; 
    
    try {
        let query = `
            SELECT 
                t.*, 
                u.full_name, u.avatar_url, u.phone_number,
                v.car_type, v.plate_number, v.color, v.model_year
            FROM trips t
            JOIN users u ON t.driver_id = u.id
            LEFT JOIN vehicles v ON v.driver_id = u.id
            WHERE t.status = 'scheduled' 
            AND t.available_seats > 0
            AND t.departure_time > NOW() 
        `;
        
        const params = [];
        let idx = 1;

        // Xử lý tìm Điểm đi thông minh
        if (origin) { 
            // Chuẩn hóa chuỗi tìm kiếm từ khách: Xóa dấu + Chữ thường + Xóa cách
            const cleanOrigin = removeAccents(origin).toLowerCase().replace(/\s+/g, '');
            // Sử dụng unaccent() của Postgres để so khớp (Đã bỏ dấu cách và chữ hoa)
            query += ` AND unaccent(LOWER(REPLACE(t.origin, ' ', ''))) ILIKE $${idx++}`; 
            params.push(`%${cleanOrigin}%`); 
        }

        // Xử lý tìm Điểm đến thông minh
        if (destination) { 
            const cleanDest = removeAccents(destination).toLowerCase().replace(/\s+/g, '');
            query += ` AND unaccent(LOWER(REPLACE(t.destination, ' ', ''))) ILIKE $${idx++}`; 
            params.push(`%${cleanDest}%`); 
        }
        
        if (date) {
            query += ` AND DATE(t.departure_time) = $${idx++}`;
            params.push(date); 
        }

        query += ` ORDER BY t.departure_time ASC`;
        
        const result = await pool.query(query, params);
        res.json({ success: true, trips: result.rows });
    } catch (err) {
        console.error("Lỗi searchTrips thông minh:", err);
        res.status(500).json({ message: "Lỗi tìm kiếm" });
    }
};

// 3. LẤY DANH SÁCH CHUYẾN CỦA TÀI XẾ (Dashboard)
exports.getDriverTrips = async (req, res) => {
    try {
        const driver_id = req.user.id;

        const query = `
            SELECT 
                t.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'booking_id', b.id,
                            'passenger_name', u.full_name,
                            'passenger_phone', u.phone_number,
                            'passenger_avatar', u.avatar_url,
                            'seats', b.seats_booked,
                            'total_price', b.total_price,
                            'booking_status', b.status,
                            'passenger_lat', b.pickup_lat,    
                            'passenger_long', b.pickup_long   
                        ) 
                    ) FILTER (WHERE b.id IS NOT NULL), 
                    '[]'
                ) as passenger_list,
                (SELECT COALESCE(SUM(b2.seats_booked), 0) FROM bookings b2 WHERE b2.trip_id = t.id AND b2.status != 'cancelled') as total_passengers,
                t.total_seats 
            FROM trips t
            LEFT JOIN bookings b ON t.id = b.trip_id
            LEFT JOIN users u ON b.passenger_id = u.id
            WHERE t.driver_id = $1
            GROUP BY t.id
            ORDER BY t.departure_time DESC
        `;

        const result = await pool.query(query, [driver_id]);
        res.json({ success: true, trips: result.rows });
    } catch (err) {
        console.error("Lỗi getDriverTrips:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
};

// 4. LẤY CHI TIẾT 1 CHUYẾN
exports.getTripDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
                b.id as booking_id, b.seats_booked, b.total_price, b.status as booking_status,
                b.pickup_lat, b.pickup_long,
                u.full_name, u.phone_number, u.avatar_url
            FROM bookings b
            JOIN users u ON b.passenger_id = u.id
            WHERE b.trip_id = $1 AND b.status != 'cancelled'
        `;
        const result = await pool.query(query, [id]);
        res.json({ success: true, passengers: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    }
};

// 5. KHỞI HÀNH (Start Trip) - ĐÃ THÊM SOCKET ĐỒNG BỘ ADMIN
exports.startTrip = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("UPDATE trips SET status = 'ongoing' WHERE id = $1 AND driver_id = $2", [id, req.user.id]);
        
        const io = req.io || req.app.get('io');
        if (io) {
            // Báo cho Khách
            io.to(`trip_${id}`).emit("booking_update", { 
                message: "Tài xế đã bắt đầu chuyến đi! Bạn có thể xem vị trí trên bản đồ.",
                status: 'ongoing',
                trip_id: id
            });

            // Báo cho Admin cập nhật trạng thái "ĐANG THỰC HIỆN"
            io.emit("server_update_trips", { 
                message: `Chuyến xe #${id} đã bắt đầu khởi hành!`,
                trip_id: id
            });
        }
        
        res.json({ success: true, message: "Chuyến đi đã bắt đầu!" });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server" });
    }
};

// 6. HOÀN THÀNH CHUYẾN (Complete Trip) - [ĐÃ TỐI ƯU TRANSACTION & SOCKET ADMIN]
exports.completeTrip = async (req, res) => {
    const client = await pool.connect(); 
    try {
        const { id } = req.params;
        await client.query('BEGIN'); 

        const checkRes = await client.query(
            "SELECT status FROM trips WHERE id = $1 AND driver_id = $2", 
            [id, req.user.id]
        );

        if (checkRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Chuyến đi không tồn tại hoặc không phải của bạn" });
        }

        const currentStatus = checkRes.rows[0].status;

        if (currentStatus === 'cancelled') {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: "⛔ Chuyến đi này ĐÃ BỊ HỦY bởi Admin. Bạn không thể hoàn thành." 
            });
        }

        await client.query(
            "UPDATE trips SET status = 'completed' WHERE id = $1 RETURNING *", 
            [id]
        );

        await client.query(
            "UPDATE bookings SET status = 'completed' WHERE trip_id = $1 AND status IN ('confirmed', 'picked_up')", 
            [id]
        );

        await client.query('COMMIT'); 

        const io = req.io || req.app.get('io');
        
        if (io) {
            console.log(`🏁 Chuyến xe ${id} đã hoàn thành.`);
            
            // A. Báo cho Khách hàng trong chuyến
            io.to(`trip_${id}`).emit("booking_update", { 
                message: "Chuyến đi đã kết thúc. Cảm ơn bạn đã sử dụng dịch vụ!",
                status: 'completed',
                trip_id: id
            });

            // B. Báo cho Admin cập nhật trạng thái "HOÀN THÀNH"
            io.emit("server_update_trips", { 
                message: `Tài xế đã hoàn thành chuyến #${id}`,
                trip_id: id
            });
        }

        res.json({ success: true, message: "Chuyến đi hoàn tất!" });

    } catch (err) {
        await client.query('ROLLBACK'); 
        console.error("Lỗi completeTrip:", err);
        res.status(500).json({ message: "Lỗi server" });
    } finally {
        client.release();
    }
};

// 7. HỦY CHUYẾN - [ĐÃ TỐI ƯU TRANSACTION]
exports.cancelTrip = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params; 
        
        await client.query('BEGIN');

        await client.query(
            "UPDATE trips SET status = 'cancelled' WHERE id = $1 AND driver_id = $2", 
            [id, req.user.id]
        );
        
        await client.query("UPDATE bookings SET status = 'cancelled' WHERE trip_id = $1", [id]);

        await client.query('COMMIT');

        const io = req.io || req.app.get('io'); 
        if (io) {
            io.to(`trip_${id}`).emit('booking_update', {
                message: 'Tài xế đã hủy chuyến đi.',
                status: 'cancelled',
                trip_id: id,
                type: 'CANCEL_TRIP'
            });

            // Báo Admin đồng bộ trạng thái "ĐÃ HỦY"
            io.emit("server_update_trips", { 
                message: `Tài xế đã tự hủy chuyến #${id}`,
                trip_id: id
            });
        }

        res.json({ success: true, message: "Đã hủy chuyến đi và thông báo cho khách." });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Lỗi cancelTrip:", err);
        res.status(500).json({ message: "Lỗi server" });
    } finally {
        client.release();
    }
};

// API THỐNG KÊ THU NHẬP
exports.getDriverStats = async (req, res) => {
    try {
        const driver_id = req.user.id;

        const tripCountResult = await pool.query(
            "SELECT COUNT(*) as total FROM trips WHERE driver_id = $1 AND status = 'completed'", 
            [driver_id]
        );

        const incomeResult = await pool.query(`
            SELECT COALESCE(SUM(b.total_price), 0) as total
            FROM bookings b
            JOIN trips t ON b.trip_id = t.id
            WHERE t.driver_id = $1 AND b.status = 'completed'
        `, [driver_id]);
        
        const userResult = await pool.query(
            "SELECT full_name, avatar_url, rating_avg, total_reviews FROM users WHERE id = $1", 
            [driver_id]
        );

        const user = userResult.rows[0];

        res.json({
            success: true,
            data: {
                total_income: incomeResult.rows[0].total,
                total_trips: tripCountResult.rows[0].total,
                full_name: user.full_name,
                avatar_url: user.avatar_url,
                rating_avg: parseFloat(user.rating_avg || 5.0).toFixed(1),
                total_reviews: user.total_reviews
            }
        });

    } catch (err) {
        console.error("Lỗi getDriverStats:", err);
        res.status(500).json({ message: "Lỗi lấy thống kê" });
    }
};