const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_123';

// Hàm tạo Token
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '30d' });
};

// --- 1. ĐĂNG KÝ ---
exports.register = async (req, res) => {
    const { full_name, email, password, phone_number, role, car_type, plate_number, vehicle_seats, vehicle_year, vehicle_color } = req.body;

    if (!full_name || !email || !password || !phone_number || !role) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc." });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const check = await client.query("SELECT id FROM users WHERE email = $1 OR phone_number = $2", [email, phone_number]);
        if (check.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ success: false, message: "Email hoặc SĐT đã tồn tại." });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const avatarUrl = (req.files && req.files['avatar'] && req.files['avatar'][0]) 
            ? `/uploads/${req.files['avatar'][0].filename}` 
            : null;
        const licenseUrl = (req.files && req.files['license'] && req.files['license'][0]) 
            ? `/uploads/${req.files['license'][0].filename}` 
            : null;
        const registrationUrl = (req.files && req.files['vehicle_registration'] && req.files['vehicle_registration'][0]) 
            ? `/uploads/${req.files['vehicle_registration'][0].filename}` 
            : null;

        // 👇 ĐÃ SỬA: Thêm status = 'pending' cho driver
        let initialStatus = 'active'; // Mặc định cho passenger
        if (role === 'driver') {
            initialStatus = 'pending'; // Driver phải chờ duyệt
        }

        const userRes = await client.query(
            `INSERT INTO users (full_name, email, password, phone_number, role, avatar_url, status, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
            [full_name, email, hash, phone_number, role, avatarUrl, initialStatus]
        );
        const user = userRes.rows[0];

        if (role === 'driver') {
            if (!plate_number || !car_type) {
                await client.query("ROLLBACK");
                return res.status(400).json({ success: false, message: "Tài xế phải nhập Biển số và Loại xe." });
            }
            await client.query(
                `INSERT INTO vehicles (driver_id, car_type, plate_number, seats, color, model_year, license_image_url, registration_image_url, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                [user.id, car_type, plate_number, vehicle_seats || 4, vehicle_color, vehicle_year, licenseUrl, registrationUrl]
            );
        }

        await client.query("COMMIT");
        
        delete user.password;
        const token = generateToken(user.id, user.role);

        res.status(201).json({ success: true, message: "Đăng ký thành công!", token, user });

    } catch (err) {
        if (client) await client.query("ROLLBACK");
        console.error("Register Error:", err);
        res.status(500).json({ success: false, message: "Lỗi server khi đăng ký." });
    } finally {
        if (client) client.release();
    }
};

// --- 2. ĐĂNG NHẬP ---
exports.login = async (req, res) => {
    try {
        console.log("1️⃣ SERVER NHẬN LOGIN:", req.body); 

        const { email, phone_number, password } = req.body;
        const loginInput = email || phone_number;

        if (!loginInput || !password) {
            console.log("❌ Lỗi: Thiếu SĐT hoặc Password!");
            return res.status(400).json({ 
                success: false, 
                message: "Vui lòng nhập Email/SĐT và Mật khẩu!" 
            });
        }

        const client = await pool.connect();
        try {
            const query = "SELECT * FROM users WHERE email = $1 OR phone_number = $1";
            const result = await client.query(query, [loginInput]);
            const user = result.rows[0];

            if (!user) {
                return res.status(401).json({ success: false, message: "Tài khoản không tồn tại." });
            }

            // 👇 KIỂM TRA TRẠNG THÁI TÀI KHOẢN KHI ĐĂNG NHẬP
            if (user.status === 'blocked') {
                return res.status(403).json({ success: false, message: "Tài khoản đã bị KHÓA." });
            }
            if (user.status === 'pending' && user.role === 'driver') {
                // Tùy chọn: Có cho phép login khi chưa duyệt không? 
                // Thông thường vẫn cho login nhưng hạn chế quyền.
                // Nếu muốn chặn luôn thì bỏ comment dòng dưới:
                // return res.status(403).json({ success: false, message: "Tài khoản đang chờ duyệt." });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: "Mật khẩu không đúng." });
            }

            let finalPlate = null;
            if (user.role === 'driver') {
                const vRes = await client.query("SELECT plate_number FROM vehicles WHERE driver_id = $1", [user.id]);
                if (vRes.rows.length > 0) {
                    finalPlate = vRes.rows[0].plate_number;
                }
            }

            console.log("✅ LOGIN THÀNH CÔNG - Biển số:", finalPlate);

            const token = generateToken(user.id, user.role);

            res.json({
                success: true,
                message: "Đăng nhập thành công!",
                token,
                user: {
                    id: user.id,
                    full_name: user.full_name,
                    email: user.email,
                    phone_number: user.phone_number,
                    role: user.role,
                    avatar_url: user.avatar_url,
                    plate_number: finalPlate,
                    status: user.status // Trả về status để App biết
                }
            });

        } finally {
            client.release();
        }

    } catch (err) {
        console.error("Lỗi Đăng nhập:", err);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// --- 3. LẤY THÔNG TIN CÁ NHÂN ---
exports.getMe = async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.full_name, u.email, u.phone_number, u.role, u.avatar_url, u.updated_at, u.status,
                   v.plate_number, v.car_type 
            FROM users u
            LEFT JOIN vehicles v ON u.id = v.driver_id
            WHERE u.id = $1
        `;
        
        const result = await pool.query(query, [req.user.id]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });
        
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error("GetMe Error:", err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

// --- 4. CẬP NHẬT PROFILE ---
exports.updateProfile = async (req, res) => {
    const userId = req.user.id;
    const { full_name, email, phone_number } = req.body;

    try {
        const userCheck = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ message: "User không tồn tại" });
        
        const user = userCheck.rows[0];

        if (user.updated_at) {
            const lastUpdate = new Date(user.updated_at);
            const now = new Date();
            const diffDays = Math.ceil(Math.abs(now - lastUpdate) / (1000 * 60 * 60 * 24));

            if (diffDays < 90) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Hồ sơ chỉ được sửa 3 tháng/lần. Hãy đợi thêm ${90 - diffDays} ngày.` 
                });
            }
        }

        let avatarUrl = user.avatar_url;
        if (req.file) {
            avatarUrl = `/uploads/${req.file.filename}`;
        }

        const updateQuery = `
            UPDATE users 
            SET full_name = $1, email = $2, phone_number = $3, avatar_url = $4, updated_at = NOW()
            WHERE id = $5 RETURNING id, full_name, email, phone_number, role, avatar_url
        `;
        
        const result = await pool.query(updateQuery, [full_name, email, phone_number, avatarUrl, userId]);

        res.json({ success: true, message: "Cập nhật hồ sơ thành công!", user: result.rows[0] });

    } catch (err) {
        console.error("UpdateProfile Error:", err);
        if (err.code === '23505') { 
            return res.status(409).json({ success: false, message: "Email hoặc SĐT mới đã được sử dụng bởi người khác." });
        }
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

// --- 5. LẤY PROFILE (Alias) ---
exports.getProfile = async (req, res) => {
    exports.getMe(req, res);
};