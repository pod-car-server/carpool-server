const pool = require('../config/db');

// 👇 HÀM SINH MÃ GIAO DỊCH (Để lưu lịch sử trừ/hoàn tiền)
const generateTransCode = () => 'TRX' + Date.now() + Math.floor(Math.random() * 100);

// 1. ĐẶT VÉ (BOOKING) - TÍNH NĂNG: TRỪ TIỀN VÍ TÀI XẾ (% CHIẾT KHẤU)
exports.createBooking = async (req, res) => {
    const client = await pool.connect();
    try {
        const { trip_id, seats_booked, pickup_lat, pickup_long } = req.body;
        const passenger_id = req.user.id;

        await client.query('BEGIN'); 

        // 1. CHECK KHOÁ TÀI KHOẢN KHÁCH
        const userCheck = await client.query("SELECT status, lock_expires_at FROM users WHERE id = $1", [passenger_id]);
        const user = userCheck.rows[0];
        if (user && user.status === 'blocked') {
            const now = new Date();
            if (user.lock_expires_at && now > new Date(user.lock_expires_at)) {
                await client.query("UPDATE users SET status = 'active', lock_expires_at = NULL WHERE id = $1", [passenger_id]);
            } else {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: "Tài khoản của bạn đang bị KHÓA." });
            }
        }

        // 2. CHECK VÉ CŨ CHƯA HOÀN THÀNH
        const activeBooking = await client.query(
            `SELECT b.id FROM bookings b JOIN trips t ON b.trip_id = t.id
             WHERE b.passenger_id = $1 AND b.status IN ('confirmed', 'picked_up') AND t.status IN ('scheduled', 'ongoing')`, 
            [passenger_id]
        );
        if (activeBooking.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "Bạn đang có chuyến đi chưa hoàn thành." });
        }

        // 3. LẤY THÔNG TIN CHUYẾN XE + THÔNG TIN VÍ TÀI XẾ
        // 👇 (Quan trọng: Lấy commission_rate và balance của tài xế)
        const tripRes = await client.query(
            `SELECT t.*, u.commission_rate, u.balance 
             FROM trips t 
             JOIN users u ON t.driver_id = u.id 
             WHERE t.id = $1 FOR UPDATE`, 
            [trip_id]
        );
        
        if (tripRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Chuyến xe không tồn tại" });
        }

        const trip = tripRes.rows[0];

        if (trip.status !== 'scheduled') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Chuyến xe này không khả dụng." });
        }
        if (trip.available_seats < seats_booked) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Không đủ ghế trống!" });
        }

        // 👇👇👇 4. LOGIC TÍNH TOÁN & TRỪ TIỀN TÀI XẾ 👇👇👇
        const total_price = trip.price * seats_booked; // Tổng tiền vé khách trả
        const rate = trip.commission_rate || 10;       // % Chiết khấu (mặc định 10%)
        const commissionFee = total_price * (rate / 100); // Số tiền phải trừ ví

        // Kiểm tra ví tài xế có đủ tiền trừ không
        if (parseFloat(trip.balance) < commissionFee) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: `Tài xế không đủ điều kiện nhận chuyến (Thiếu số dư ví).` // Thông báo khéo léo
            });
        }

        // Trừ tiền ví tài xế
        await client.query(
            "UPDATE users SET balance = balance - $1 WHERE id = $2",
            [commissionFee, trip.driver_id]
        );

        // Lưu lịch sử giao dịch trừ tiền
        const transCode = generateTransCode();
        await client.query(
            `INSERT INTO transactions (user_id, amount, type, status, description, code, created_at)
             VALUES ($1, $2, 'fee_deduction', 'completed', $3, $4, NOW())`,
            [trip.driver_id, -commissionFee, `Phí nhận khách (Trip #${trip_id}) - ${rate}%`, transCode]
        );
        // 👆👆👆 KẾT THÚC LOGIC TRỪ TIỀN 👆👆👆


        // 5. TẠO BOOKING
        const insertRes = await client.query(
            `INSERT INTO bookings (trip_id, passenger_id, seats_booked, total_price, status, pickup_lat, pickup_long, created_at)
             VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, NOW()) RETURNING *`,
            [trip_id, passenger_id, seats_booked, total_price, pickup_lat, pickup_long] 
        );
        const newBooking = insertRes.rows[0];

        // 6. TRỪ GHẾ TRỐNG
        await client.query(
            "UPDATE trips SET available_seats = available_seats - $1 WHERE id = $2",
            [seats_booked, trip_id]
        );

        const userRes = await client.query("SELECT full_name, phone_number FROM users WHERE id = $1", [passenger_id]);
        const passengerInfo = userRes.rows[0];

        await client.query('COMMIT'); 

        // 7. SOCKET REALTIME
        const io = req.app.get('io'); 
        if (io) {
            // Báo Admin
            io.emit("server_update_trips", { message: "Có khách vừa đặt vé mới!", trip_id: trip_id });

            // Báo Tài xế
            io.to(`driver_${trip.driver_id}`).emit("new_booking", {
                message: `Khách ${passengerInfo.full_name} vừa đặt ${seats_booked} ghế! (Đã trừ phí: ${commissionFee.toLocaleString()}đ)`,
                booking: { ...newBooking, passenger_name: passengerInfo.full_name, passenger_phone: passengerInfo.phone_number, pickup_lat, pickup_long }
            });

            // Báo Tài xế cập nhật lại số dư ví ngay lập tức
            io.to(`driver_${trip.driver_id}`).emit("RELOAD_WALLET");
        }

        res.status(201).json({ success: true, message: "Đặt vé thành công!", booking: newBooking });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Lỗi đặt vé:", err);
        res.status(500).json({ message: "Lỗi Server" });
    } finally {
        client.release();
    }
};

// 2. LẤY DANH SÁCH VÉ CỦA TÔI
exports.getMyBookings = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT b.*, t.origin, t.destination, t.departure_time, t.status as trip_status, t.driver_id,
                u.full_name as driver_name, u.phone_number as driver_phone, u.avatar_url as driver_avatar,
                v.car_type, v.plate_number, v.color
            FROM bookings b
            JOIN trips t ON b.trip_id = t.id
            JOIN users u ON t.driver_id = u.id
            LEFT JOIN vehicles v ON v.driver_id = u.id
            WHERE b.passenger_id = $1
            ORDER BY b.created_at DESC
        `;
        const result = await pool.query(query, [userId]);
        res.json({ success: true, bookings: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi lấy danh sách vé" });
    }
};

// 3. HỦY VÉ (TÍNH NĂNG: HOÀN TIỀN LẠI CHO TÀI XẾ)
exports.cancelBooking = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params; 
        const userId = req.user.id; 
        const { reason } = req.body; 

        await client.query('BEGIN');

        // 1. LẤY THÔNG TIN BOOKING + DRIVER + COMMISSION
        const query = `
            SELECT b.*, t.driver_id, t.status as trip_status, u.commission_rate
            FROM bookings b
            JOIN trips t ON b.trip_id = t.id
            JOIN users u ON t.driver_id = u.id
            WHERE b.id = $1
        `;
        const bookingRes = await client.query(query, [id]);

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Vé không tồn tại" });
        }

        const booking = bookingRes.rows[0];

        // Check quyền
        const isPassenger = booking.passenger_id === userId;
        const isDriver = booking.driver_id === userId;
        if (!isPassenger && !isDriver) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: "Bạn không có quyền hủy vé này!" });
        }

        if (booking.status === 'cancelled') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Vé này đã bị hủy trước đó." });
        }

        // 👇👇👇 2. LOGIC HOÀN TIỀN CHO TÀI XẾ 👇👇👇
        // Chỉ hoàn tiền nếu vé đang ở trạng thái 'confirmed' hoặc 'picked_up' (tức là đã trừ tiền rồi)
        if (booking.status === 'confirmed' || booking.status === 'picked_up') {
            
            const totalFare = parseFloat(booking.total_price);
            const rate = booking.commission_rate || 10;
            const refundAmount = totalFare * (rate / 100); // Tính lại số tiền cần hoàn

            // Cộng tiền lại vào ví tài xế
            await client.query(
                "UPDATE users SET balance = balance + $1 WHERE id = $2",
                [refundAmount, booking.driver_id]
            );

            // Lưu lịch sử giao dịch (Hoàn tiền)
            const transCode = generateTransCode();
            await client.query(
                `INSERT INTO transactions (user_id, amount, type, status, description, code, created_at)
                 VALUES ($1, $2, 'fee_refund', 'completed', $3, $4, NOW())`,
                [booking.driver_id, refundAmount, `Hoàn phí do hủy vé #${id}`, transCode]
            );
            
            console.log(`💰 Đã hoàn ${refundAmount}đ cho tài xế ID ${booking.driver_id}`);
        }
        // 👆👆👆 KẾT THÚC LOGIC HOÀN TIỀN 👆👆👆


        // 3. CẬP NHẬT TRẠNG THÁI BOOKING
        await client.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [id]);

        // 4. CỘNG LẠI GHẾ
        await client.query("UPDATE trips SET available_seats = available_seats + $1 WHERE id = $2", [booking.seats_booked, booking.trip_id]);
        
        // 5. SOCKET
        const io = req.app.get('io'); 
        if(io) {
            io.emit("server_update_trips", { message: "Một vé vừa bị hủy!", trip_id: booking.trip_id });

            if (isPassenger) {
                io.to(`driver_${booking.driver_id}`).emit("booking_cancelled", {
                    message: `Khách hàng vừa HỦY vé #${id}. Đã hoàn lại phí chiết khấu.`,
                    bookingId: id,
                    tripId: booking.trip_id
                });
                // Báo tài xế cập nhật ví
                io.to(`driver_${booking.driver_id}`).emit("RELOAD_WALLET");
            }
            
            if (isDriver) {
                io.to(`trip_${booking.trip_id}`).emit("booking_update", {
                    message: `Tài xế đã hủy vé của bạn. Lý do: ${reason || 'Không có'}`,
                    status: 'cancelled',
                    booking_id: id,
                    passenger_id: booking.passenger_id,
                    initiator: 'driver' 
                });
                // Tài xế tự hủy cũng được hoàn phí (tuỳ chính sách, code này đang cho phép hoàn)
                io.to(`driver_${booking.driver_id}`).emit("RELOAD_WALLET");
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "Hủy vé thành công (Đã hoàn phí dịch vụ)" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Lỗi hủy vé:", err);
        res.status(500).json({ message: "Lỗi server" });
    } finally {
        client.release();
    }
};

// 4. ĐÓN KHÁCH
exports.pickUpPassenger = async (req, res) => {
    try {
        const { id } = req.params; 
        const result = await pool.query("UPDATE bookings SET status = 'picked_up' WHERE id = $1 RETURNING passenger_id, trip_id", [id]);
        
        if (result.rows.length > 0) {
            const booking = result.rows[0];
            const io = req.app.get('io'); 
            if (io) {
                io.to(`trip_${booking.trip_id}`).emit("booking_update", {
                    message: "Tài xế xác nhận bạn đã lên xe!",
                    status: 'picked_up',
                    booking_id: id,
                    passenger_id: booking.passenger_id
                });
                io.emit("server_update_trips", { message: `Tài xế đã đón khách chuyến #${booking.trip_id}` });
            }
        }
        res.json({ success: true, message: "Đã đón khách" });
    } catch (err) {
        console.error("Lỗi PickUp:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
};