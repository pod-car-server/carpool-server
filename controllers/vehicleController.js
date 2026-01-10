// File: src/controllers/vehicleController.js
const pool = require('../config/db');

// 1. THÊM XE MỚI
exports.addVehicle = async (req, res) => {
    const { car_type, plate_number, seats, color, model_year } = req.body;
    const driver_id = req.user.id;

    if (!car_type || !plate_number || !seats) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin xe (Loại xe, Biển số, Số ghế)." });
    }

    try {
        // Xử lý ảnh xe (nếu có upload)
        const carImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        const result = await pool.query(
            `INSERT INTO vehicles (driver_id, car_type, plate_number, seats, color, model_year, license_image_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [driver_id, car_type, plate_number, seats, color, model_year, carImageUrl]
        );

        res.status(201).json({ success: true, message: "Thêm xe thành công!", vehicle: result.rows[0] });
    } catch (err) {
        console.error("Lỗi thêm xe:", err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

// 2. LẤY XE CỦA TÔI
exports.getMyVehicle = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM vehicles WHERE driver_id = $1", [req.user.id]);
        
        // Trả về danh sách xe (Mảng) thay vì 1 object, để phòng trường hợp sau này cho phép nhiều xe
        // Nhưng nếu logic app chỉ 1 xe thì lấy rows[0]
        if (result.rows.length === 0) {
            return res.json({ success: true, vehicles: [], message: "Bạn chưa đăng ký xe." });
        }
        res.json({ success: true, vehicles: result.rows }); 
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

// 3. CẬP NHẬT XE
exports.updateVehicle = async (req, res) => {
    const { id } = req.params;
    const { car_type, plate_number, seats, color, model_year } = req.body;

    try {
        // 1. Kiểm tra xe có tồn tại và thuộc về tài xế không
        const check = await pool.query("SELECT * FROM vehicles WHERE id = $1 AND driver_id = $2", [id, req.user.id]);
        if (check.rows.length === 0) return res.status(404).json({ message: "Không tìm thấy xe." });

        const vehicle = check.rows[0];

        // 2. LOGIC KIỂM TRA 3 THÁNG (90 NGÀY)
        const lastUpdate = new Date(vehicle.updated_at);
        const now = new Date();
        
        // Tính khoảng cách thời gian (mili giây)
        const diffTime = Math.abs(now - lastUpdate);
        // Đổi ra ngày
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Nếu chưa đủ 90 ngày thì chặn
        if (diffDays < 90) {
            const daysLeft = 90 - diffDays;
            return res.status(403).json({ 
                success: false, 
                message: `Bạn chỉ được cập nhật xe 3 tháng/lần. Vui lòng quay lại sau ${daysLeft} ngày nữa.` 
            });
        }

        // 3. Xử lý ảnh (nếu có)
        let carImageUrl = vehicle.license_image_url;
        if (req.file) {
            carImageUrl = `/uploads/${req.file.filename}`;
        }

        // 4. Cập nhật và set lại updated_at thành NOW()
        const updateQuery = `
            UPDATE vehicles 
            SET car_type = $1, plate_number = $2, seats = $3, color = $4, model_year = $5, license_image_url = $6, updated_at = NOW()
            WHERE id = $7 RETURNING *
        `;
        const result = await pool.query(updateQuery, [car_type, plate_number, seats, color, model_year, carImageUrl, id]);

        res.json({ success: true, message: "Cập nhật thành công!", vehicle: result.rows[0] });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

// 4. XÓA XE
exports.deleteVehicle = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM vehicles WHERE id = $1 AND driver_id = $2 RETURNING *", [id, req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Không tìm thấy xe." });

        res.json({ success: true, message: "Đã xóa xe." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};