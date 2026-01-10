const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// 1. LẤY DANH SÁCH KHÁCH
exports.getAllPassengers = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users WHERE LOWER(role) = 'passenger' ORDER BY created_at DESC");
        res.json({ success: true, passengers: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi server" });
    }
};

// 2. LẤY DANH SÁCH TÀI XẾ (ĐÃ THÊM LẤY MÀU XE)
exports.getAllDrivers = async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.full_name, u.phone_number, u.email, u.created_at, u.avatar_url,
                   v.plate_number, v.car_type, v.seats, v.color, v.status,
                   v.license_image_url, v.registration_image_url,
                   u.commission_rate -- Thêm cột này
            FROM users u
            LEFT JOIN vehicles v ON u.id = v.driver_id
            WHERE LOWER(u.role) = 'driver'
            ORDER BY u.created_at DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, drivers: result.rows });
    } catch (err) {
        console.error("Lỗi lấy danh sách tài xế:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
};

// 3. RESET MẬT KHẨU
exports.forceResetPassword = async (req, res) => {
    const { phone_number } = req.body; 
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash("123456", salt);
        await pool.query("UPDATE users SET password = $1 WHERE phone_number = $2", [hashedPassword, phone_number]);
        res.json({ success: true, message: "Đã reset mật khẩu thành 123456" });
    } catch (err) {
        res.status(500).json({ message: "Lỗi server" });
    }
};

// 4. XỬ LÝ DUYỆT / KHÓA TÀI XẾ
exports.updateDriverStatus = async (req, res) => {
    const { id, action } = req.params; 

    try {
        let status = 'pending';
        let messageText = '';

        if (action === 'approve') {
            status = 'active'; 
            messageText = 'Đã kích hoạt tài xế thành công!';
        } else if (action === 'block') {
            status = 'blocked'; 
            messageText = 'Đã khóa tài khoản tài xế!';
        } else {
            return res.status(400).json({ success: false, message: "Hành động không hợp lệ" });
        }

        const result = await pool.query(
            "UPDATE vehicles SET status = $1 WHERE driver_id = $2 RETURNING *",
            [status, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy xe của tài xế này" });
        }

        res.json({ success: true, message: messageText });
    } catch (err) {
        console.error("Lỗi cập nhật trạng thái:", err);
        res.status(500).json({ success: false, message: "Lỗi server khi cập nhật trạng thái" });
    }
};

// 5. SỐ LIỆU DASHBOARD
exports.getDashboardStats = async (req, res) => {
    try {
        const [passengers, drivers, revenue] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users WHERE LOWER(role) = 'passenger'"),
            pool.query("SELECT COUNT(*) FROM users WHERE LOWER(role) = 'driver'"),
            pool.query("SELECT COALESCE(SUM(total_price), 0) as total FROM bookings WHERE LOWER(status) = 'completed'")
        ]);
        res.json({
            success: true,
            total_passengers: parseInt(passengers.rows[0].count),
            total_drivers: parseInt(drivers.rows[0].count),
            pending_drivers: 0,
            total_revenue: parseInt(revenue.rows[0].total)
        });
    } catch (err) {
        console.error("Lỗi Dashboard:", err);
        res.status(500).json({ message: "Lỗi Dashboard" });
    }
};

// 6. THỐNG KÊ TÀI XẾ
exports.getDriverRevenueStats = async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.full_name, u.phone_number,
                   COUNT(CASE WHEN LOWER(b.status) = 'completed' THEN 1 END) as completed_trips,
                   COALESCE(SUM(CASE WHEN LOWER(b.status) = 'completed' THEN b.total_price END), 0) as total_revenue,
                   COUNT(CASE WHEN LOWER(b.status) = 'cancelled' THEN 1 END) as cancelled_trips
            FROM users u
            LEFT JOIN trips t ON u.id = t.driver_id
            LEFT JOIN bookings b ON t.id = b.trip_id
            WHERE LOWER(u.role) = 'driver'
            GROUP BY u.id, u.full_name, u.phone_number
            ORDER BY total_revenue DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, stats: result.rows });
    } catch (err) {
        console.error("Lỗi thống kê tài xế:", err);
        res.status(500).json({ message: "Lỗi server khi thống kê tài xế" });
    }
};

// 7. CẬP NHẬT FULL QUYỀN TÀI XẾ (ĐÃ THÊM MÀU XE VÀ CHIẾT KHẤU)
exports.updateDriver = async (req, res) => {
    const { id } = req.params; 
    
    console.log("📝 Đang cập nhật tài xế ID:", id);

    const { 
        full_name, phone_number, email, avatar_url, 
        plate_number, vehicle_type, color, seats, 
        license_image_url, vehicle_registration_image_url,
        commission_rate // Nhận % chiết khấu
    } = req.body; 

    // Xử lý dữ liệu an toàn
    const safePlateNumber = plate_number || "Chưa cập nhật"; 
    const safeVehicleType = vehicle_type || "Chưa rõ";
    const safeColor = color || "Chưa rõ"; 
    const safeSeats = seats ? parseInt(seats) : 4; 
    const safeAvatar = avatar_url || "";
    const safeLicense = license_image_url || "";
    const safeRegImage = vehicle_registration_image_url || "";
    const safeCommission = commission_rate ? parseInt(commission_rate) : 10;

    try {
        // A. CẬP NHẬT BẢNG USERS
        console.log("🔄 Update Users...");
        await pool.query(
            "UPDATE users SET full_name = $1, phone_number = $2, email = $3, avatar_url = $4, commission_rate = $5 WHERE id = $6",
            [full_name, phone_number, email, safeAvatar, safeCommission, id]
        );

        // B. CẬP NHẬT BẢNG VEHICLES
        console.log("🔄 Update Vehicles...");
        const check = await pool.query("SELECT * FROM vehicles WHERE driver_id = $1", [id]);
        
        if (check.rows.length === 0) {
            // INSERT
            await pool.query(
                `INSERT INTO vehicles (driver_id, plate_number, car_type, color, seats, license_image_url, registration_image_url, status, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())`,
                [id, safePlateNumber, safeVehicleType, safeColor, safeSeats, safeLicense, safeRegImage]
            );
        } else {
            // UPDATE
            await pool.query(
                `UPDATE vehicles SET plate_number = $1, car_type = $2, color = $3, seats = $4, license_image_url = $5, registration_image_url = $6, updated_at = NOW() WHERE driver_id = $7`,
                [safePlateNumber, safeVehicleType, safeColor, safeSeats, safeLicense, safeRegImage, id]
            );
        }

        console.log("✅ Cập nhật thành công!");
        res.json({ success: true, message: "Đã cập nhật thông tin tài xế thành công!" });

    } catch (err) {
        console.error("❌ LỖI UPDATE TÀI XẾ:", err);
        res.status(500).json({ success: false, message: "Lỗi Server: " + err.message });
    }
};

// 8. KHOÁ KHÁCH HÀNG
exports.lockPassenger = async (req, res) => {
    const { id } = req.params;
    const { hours } = req.body; 

    try {
        let status = 'blocked';
        let expiryDate = null;
        let message = '';

        if (hours === 'unlock') {
            status = 'active';
            expiryDate = null;
            message = 'Đã mở khoá tài khoản thành công!';
        } else if (hours === 0) {
            expiryDate = null; 
            message = 'Đã khoá tài khoản vĩnh viễn!';
        } else {
            const now = new Date();
            now.setHours(now.getHours() + parseInt(hours));
            expiryDate = now;
            message = `Đã khoá tài khoản trong ${hours} giờ!`;
        }

        await pool.query(
            "UPDATE users SET status = $1, lock_expires_at = $2 WHERE id = $3",
            [status, expiryDate, id]
        );

        res.json({ success: true, message });

    } catch (err) {
        console.error("Lỗi khoá user:", err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

// 9. API LẤY THỐNG KÊ DOANH THU & TÌM KIẾM (CẬP NHẬT)
exports.getRevenueStats = async (req, res) => {
    try {
        const { search, month, year } = req.query; 
        const currentMonth = month || new Date().getMonth() + 1;
        const currentYear = year || new Date().getFullYear();

        // 1. Biểu đồ Tổng doanh thu (Khách trả) - Từ bảng bookings
        const revenueChartQuery = `
            SELECT TO_CHAR(created_at, 'DD') as date, SUM(total_price) as total
            FROM bookings 
            WHERE status = 'completed' 
            AND EXTRACT(MONTH FROM created_at) = $1
            AND EXTRACT(YEAR FROM created_at) = $2
            GROUP BY date 
            ORDER BY date ASC
        `;
        const chartRes = await pool.query(revenueChartQuery, [currentMonth, currentYear]);

        // 👇👇👇 MỚI: Biểu đồ Doanh thu Công ty (Phí thu về) - Từ bảng transactions
        const companyRevenueQuery = `
            SELECT TO_CHAR(created_at, 'DD') as date, SUM(ABS(amount)) as total
            FROM transactions
            WHERE type = 'fee_deduction' AND status = 'completed'
            AND EXTRACT(MONTH FROM created_at) = $1
            AND EXTRACT(YEAR FROM created_at) = $2
            GROUP BY date
            ORDER BY date ASC
        `;
        const companyRes = await pool.query(companyRevenueQuery, [currentMonth, currentYear]);
        // 👆👆👆

        // 2. Thống kê trạng thái đơn hàng
        const statusQuery = `
            SELECT status, COUNT(*) as count 
            FROM bookings 
            WHERE EXTRACT(MONTH FROM created_at) = $1
            AND EXTRACT(YEAR FROM created_at) = $2
            GROUP BY status
        `;
        const statusRes = await pool.query(statusQuery, [currentMonth, currentYear]);
        
        let completed = 0, cancelled = 0, total = 0;
        statusRes.rows.forEach(row => {
            if (row.status === 'completed') completed += parseInt(row.count);
            if (row.status === 'cancelled') cancelled += parseInt(row.count);
            total += parseInt(row.count);
        });

        // 3. Top Tài xế
        let driverQuery = `
            SELECT u.id, u.full_name, u.phone_number, u.avatar_url,
                   v.plate_number, v.car_type,
                   u.commission_rate,
                   COUNT(CASE 
                        WHEN b.status = 'completed' 
                        AND EXTRACT(MONTH FROM b.created_at) = $1
                        AND EXTRACT(YEAR FROM b.created_at) = $2
                        THEN 1 
                   END) as total_trips,
                   COALESCE(SUM(CASE 
                        WHEN b.status = 'completed' 
                        AND EXTRACT(MONTH FROM b.created_at) = $1
                        AND EXTRACT(YEAR FROM b.created_at) = $2
                        THEN b.total_price 
                        ELSE 0 
                   END), 0) as total_revenue
            FROM users u
            JOIN vehicles v ON u.id = v.driver_id
            LEFT JOIN trips t ON u.id = t.driver_id
            LEFT JOIN bookings b ON t.id = b.trip_id
            WHERE u.role = 'driver'
        `;

        const params = [currentMonth, currentYear];
        if (search) {
            driverQuery += " AND (v.plate_number ILIKE $3 OR u.phone_number ILIKE $3)";
            params.push(`%${search}%`);
        }
        driverQuery += " GROUP BY u.id, v.id ORDER BY total_revenue DESC LIMIT 20";
        
        const driverRes = await pool.query(driverQuery, params);

        res.json({
            success: true,
            chartData: chartRes.rows,          // Doanh thu tổng (Gross)
            companyChartData: companyRes.rows, // Doanh thu công ty (Net) - MỚI
            summary: { completed, cancelled, total },
            topDrivers: driverRes.rows
        });

    } catch (err) {
        console.error("Revenue Stats Error:", err);
        res.status(500).json({ success: false, message: "Lỗi lấy báo cáo." });
    }
};

// 10. API LẤY CHI TIẾT 1 TÀI XẾ
exports.getDriverRevenueDetail = async (req, res) => {
    try {
        const { id } = req.params; 
        const { month, year } = req.query; 

        const queryMonth = month || new Date().getMonth() + 1;
        const queryYear = year || new Date().getFullYear();

        const driverQuery = `
            SELECT u.id, u.full_name, u.avatar_url, u.phone_number, v.plate_number, v.car_type 
            FROM users u
            LEFT JOIN vehicles v ON u.id = v.driver_id
            WHERE u.id = $1
        `;
        const driverResult = await pool.query(driverQuery, [id]);

        if (driverResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy tài xế" });
        }

        const statsQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'completed' THEN total_price ELSE 0 END), 0) as revenue,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
            FROM bookings 
            WHERE trip_id IN (SELECT id FROM trips WHERE driver_id = $1)
            AND EXTRACT(MONTH FROM created_at) = $2 
            AND EXTRACT(YEAR FROM created_at) = $3
        `;
        const statsResult = await pool.query(statsQuery, [id, queryMonth, queryYear]);

        const chartQuery = `
            SELECT 
                TO_CHAR(created_at, 'DD') as day, 
                SUM(total_price) as daily_revenue
            FROM bookings
            WHERE trip_id IN (SELECT id FROM trips WHERE driver_id = $1)
            AND status = 'completed'
            AND EXTRACT(MONTH FROM created_at) = $2
            AND EXTRACT(YEAR FROM created_at) = $3
            GROUP BY TO_CHAR(created_at, 'DD')
            ORDER BY day ASC
        `;
        const chartResult = await pool.query(chartQuery, [id, queryMonth, queryYear]);

        res.json({
            success: true,
            info: driverResult.rows[0],
            stats: statsResult.rows[0],
            chart: chartResult.rows
        });

    } catch (error) {
        console.error("Lỗi lấy chi tiết tài xế:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi lấy báo cáo chi tiết" });
    }
};

// 11. QUẢN LÝ CHUYẾN ĐI (CÓ TÌM KIẾM & LỌC NGÀY)
exports.getAllTrips = async (req, res) => {
    try {
        const { start_date, end_date, search } = req.query; 

        let dateFilter = "t.departure_time >= NOW() - INTERVAL '3 months'";
        const params = [];
        let paramCount = 1;

        if (start_date && end_date) {
            dateFilter = `t.departure_time BETWEEN $${paramCount} AND $${paramCount + 1}`;
            params.push(start_date, end_date);
            paramCount += 2;
        }

        let searchFilter = "";
        if (search) {
            searchFilter = `AND (CAST(t.id AS TEXT) = $${paramCount} OR d.phone_number LIKE $${paramCount})`;
            params.push(search);
        }

        const query = `
            SELECT 
                t.id as trip_id, t.origin, t.destination, t.departure_time, t.price, t.total_seats, t.available_seats, t.status as trip_status,
                d.full_name as driver_name, d.phone_number as driver_phone, v.plate_number,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'booking_id', b.id,
                            'passenger_name', p.full_name, 'passenger_phone', p.phone_number,
                            'seats_booked', b.seats_booked, 'total_price', b.total_price,
                            'status', b.status,
                            'pickup_status', (CASE WHEN b.status = 'picked_up' THEN true ELSE false END)
                        ) ORDER BY b.created_at DESC
                    ) FILTER (WHERE b.id IS NOT NULL), 
                    '[]'
                ) as passengers
            FROM trips t
            JOIN users d ON t.driver_id = d.id
            LEFT JOIN vehicles v ON d.id = v.driver_id
            LEFT JOIN bookings b ON t.id = b.trip_id
            LEFT JOIN users p ON b.passenger_id = p.id
            WHERE ${dateFilter} ${searchFilter}
            GROUP BY t.id, d.id, v.id
            ORDER BY t.departure_time DESC
        `;

        const result = await pool.query(query, params);
        res.json({ success: true, trips: result.rows });

    } catch (err) {
        console.error("Lỗi lấy lịch sử chuyến đi:", err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// 12. ADMIN HỦY CHUYẾN ĐI (BẮN TIN HIỆU ADMIN_CANCEL)
exports.cancelTripByAdmin = async (req, res) => {
    const { id } = req.params; 
    console.log(`❌ Admin đang hủy chuyến: ${id}`);

    try {
        await pool.query("UPDATE trips SET status = 'cancelled' WHERE id = $1", [id]);
        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE trip_id = $1", [id]);

        if (req.io) {
            req.io.emit("server_update_trips", { message: `Chuyến ${id} đã bị hủy` });
        }

        if (req.io) {
            req.io.to(`trip_${id}`).emit("booking_update", { 
                status: 'cancelled', 
                notification_type: 'admin_cancel_trip', 
                message: "⚠️ THÔNG BÁO KHẨN: Admin đã hủy chuyến đi này! Vui lòng kiểm tra lại." 
            });
        }

        res.json({ success: true, message: "Đã hủy chuyến đi thành công!" });
    } catch (err) {
        console.error("Lỗi Admin hủy chuyến:", err);
        res.status(500).json({ success: false, message: "Lỗi Server: " + err.message });
    }
};

// 13. ADMIN HỦY VÉ KHÁCH (BÁO RIÊNG CHO KHÁCH & TÀI XẾ)
exports.cancelBookingByAdmin = async (req, res) => {
    const { id } = req.params; 
    console.log(`❌ Admin đang hủy vé: ${id}`);

    try {
        const bookingRes = await pool.query("SELECT trip_id, seats_booked, passenger_id FROM bookings WHERE id = $1", [id]);
        
        if (bookingRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy vé" });
        }

        const { trip_id, seats_booked, passenger_id } = bookingRes.rows[0];

        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [id]);
        await pool.query("UPDATE trips SET available_seats = COALESCE(available_seats, 0) + $1 WHERE id = $2", [seats_booked, trip_id]);

        if (req.io) {
            req.io.emit("server_update_trips", { message: `Vé ${id} đã hủy` });

            req.io.to(`user_${passenger_id}`).emit("booking_update", {
                status: 'cancelled',
                notification_type: 'admin_cancel_booking', 
                message: "⚠️ Admin đã hủy vé của bạn. Vui lòng liên hệ tổng đài."
            });

            req.io.to(`trip_${trip_id}`).emit("booking_update", {
                status: 'cancelled_seat', 
                notification_type: 'admin_cancel_booking_driver', 
                message: `⚠️ Admin vừa hủy vé của một hành khách (${seats_booked} ghế).`
            });
        }

        res.json({ success: true, message: "Đã hủy vé thành công!" });
    } catch (err) {
        console.error("Lỗi Admin hủy vé:", err);
        res.status(500).json({ success: false, message: "Lỗi Server: " + err.message });
    }
};

// 👇👇👇 14. LẤY DANH SÁCH GIAO DỊCH (NẠP/RÚT/PHÍ) - MỚI THÊM 👇👇👇
exports.getAllTransactions = async (req, res) => {
    try {
        const query = `
            SELECT t.*, u.full_name, u.phone_number, u.plate_number 
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            ORDER BY t.created_at DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, transactions: result.rows });
    } catch (err) {
        console.error("Lỗi lấy giao dịch:", err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// 👇👇👇 15. XỬ LÝ DUYỆT / TỪ CHỐI GIAO DỊCH - MỚI THÊM 👇👇👇
exports.handleTransaction = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id, action } = req.params; // action: 'approve' (Duyệt) hoặc 'reject' (Từ chối)
        
        await client.query('BEGIN');

        // 1. Lấy thông tin giao dịch
        const transRes = await client.query("SELECT * FROM transactions WHERE id = $1 FOR UPDATE", [id]);
        if (transRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: "Không tìm thấy giao dịch" });
        }
        const trans = transRes.rows[0];

        if (trans.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "Giao dịch này đã được xử lý trước đó." });
        }

        // 2. XỬ LÝ LOGIC
        if (action === 'approve') {
            // ✅ DUYỆT
            if (trans.type === 'deposit') {
                // Nếu là NẠP -> Cộng tiền vào ví
                await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [trans.amount, trans.user_id]);
            }
            // Nếu là RÚT -> Tiền đã trừ lúc tạo yêu cầu rồi, chỉ cần update status
            
            await client.query("UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1", [id]);
        
        } else if (action === 'reject') {
            // ❌ TỪ CHỐI
            if (trans.type === 'withdraw') {
                // Nếu là RÚT mà bị từ chối -> Phải HOÀN TIỀN lại cho tài xế
                await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [trans.amount, trans.user_id]);
            }
            // Nếu là NẠP mà từ chối -> Không làm gì cả, chỉ update status

            await client.query("UPDATE transactions SET status = 'rejected', updated_at = NOW() WHERE id = $1", [id]);
        }

        await client.query('COMMIT');

        // 3. GỬI SOCKET BÁO TÀI XẾ
        if (req.io) {
            req.io.to(`driver_${trans.user_id}`).emit("RELOAD_WALLET"); // Báo App reload ví
            
            const msg = action === 'approve' 
                ? `✅ Yêu cầu ${trans.type === 'deposit' ? 'nạp' : 'rút'} tiền #${trans.code} đã được DUYỆT.`
                : `❌ Yêu cầu ${trans.type === 'deposit' ? 'nạp' : 'rút'} tiền #${trans.code} đã bị TỪ CHỐI.`;
                
            req.io.to(`driver_${trans.user_id}`).emit("booking_update", { message: msg });
        }

        res.json({ success: true, message: "Đã cập nhật trạng thái giao dịch." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Lỗi xử lý giao dịch:", err);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    } finally {
        client.release();
    }
};