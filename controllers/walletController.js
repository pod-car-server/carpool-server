const db = require('../config/db');
// 👇 1. Import thư viện crypto (Có sẵn của Node.js)
const crypto = require('crypto');

// 👇 2. HÀM SINH MÃ MỚI (CHUẨN KHÔNG TRÙNG)
// Ví dụ kết quả: TRX8F2A1B99, TRXCC01A2B3
const generateTransCode = () => {
    // Sinh 4 byte ngẫu nhiên -> Chuyển sang Hex (thành 8 ký tự) -> Viết hoa
    return 'TRX' + crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Lấy thông tin ví (Số dư + Lịch sử)
exports.getMyWallet = async (req, res) => {
    try {
        const userId = req.user.id; // Lấy từ token

        // 1. Lấy số dư hiện tại
        const balanceRes = await db.query("SELECT balance FROM users WHERE id = $1", [userId]);
        const balance = balanceRes.rows[0]?.balance || 0;

        // 2. Lấy lịch sử giao dịch (Sắp xếp mới nhất trước)
        // 👇 Lấy đầy đủ các trường cần thiết, đặc biệt là 'code' và 'description'
        const transRes = await db.query(
            "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", 
            [userId]
        );

        res.json({
            success: true,
            balance: parseFloat(balance), // Đảm bảo trả về số thực
            transactions: transRes.rows
        });
    } catch (error) {
        console.error("Lỗi lấy ví:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// Nạp tiền
exports.deposit = async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount } = req.body;
        
        // Lấy đường dẫn ảnh từ middleware upload
        const proofImage = req.file ? req.file.path.replace(/\\/g, "/") : null;

        if (!amount || amount < 10000) {
            return res.status(400).json({ success: false, message: "Số tiền tối thiểu 10.000đ" });
        }
        if (!proofImage) {
            return res.status(400).json({ success: false, message: "Thiếu ảnh minh chứng" });
        }

        // 👇 [MỚI] TẠO MÃ GIAO DỊCH
        const transCode = generateTransCode(); 

        // Lưu giao dịch 'pending' vào DB (Đã thêm cột code)
        await db.query(
            `INSERT INTO transactions (user_id, amount, type, status, description, proof_image, created_at, code)
             VALUES ($1, $2, 'deposit', 'pending', 'Nạp tiền vào ví', $3, NOW(), $4)`,
            [userId, amount, proofImage, transCode] // <--- Thêm transCode vào tham số thứ 4
        );

        // 👇👇👇 [MỚI] BẮN SOCKET BÁO CHO ADMIN 👇👇👇
        if (req.io) {
            console.log(`🔔 [DEPOSIT] Mã ${transCode}: SERVER ĐANG BẮN TIN CHO ADMIN...`); 
            
            req.io.to("admin_room").emit("new_transaction_alert", {
                // Thêm mã code vào tin nhắn để Admin dễ thấy
                message: `🔔 [${transCode}] Tài xế nạp: ${parseInt(amount).toLocaleString('vi-VN')}đ`,
                type: 'deposit',
                code: transCode
            });
        } else {
            console.log("❌ LỖI: req.io không tồn tại (Kiểm tra lại file server.js phần app.use)");
        }
        // 👆👆👆 KẾT THÚC PHẦN MỚI 👆👆👆

        res.json({ success: true, message: "Đã gửi yêu cầu nạp tiền." });
    } catch (error) {
        console.error("Lỗi nạp tiền:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// Rút tiền
exports.withdraw = async (req, res) => {
    const client = await db.connect(); // Dùng client để chạy Transaction
    try {
        await client.query('BEGIN');
        
        const userId = req.user.id;
        const { amount } = req.body;
        const proofImage = req.file ? req.file.path.replace(/\\/g, "/") : '';

        // Kiểm tra số dư
        const balRes = await client.query("SELECT balance FROM users WHERE id = $1 FOR UPDATE", [userId]);
        const currentBalance = parseFloat(balRes.rows[0]?.balance || 0);

        if (currentBalance < amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: "Số dư không đủ" });
        }

        // Trừ tiền ngay lập tức
        await client.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [amount, userId]);

        // 👇 [MỚI] TẠO MÃ GIAO DỊCH
        const transCode = generateTransCode();

        // Tạo giao dịch (Đã thêm cột code)
        await client.query(
            `INSERT INTO transactions (user_id, amount, type, status, description, proof_image, created_at, code)
             VALUES ($1, $2, 'withdraw', 'pending', 'Rút tiền về bank', $3, NOW(), $4)`,
            [userId, amount, proofImage, transCode] // <--- Thêm transCode vào tham số thứ 4
        );

        await client.query('COMMIT');

        // 👇👇👇 [MỚI] BẮN SOCKET BÁO CHO ADMIN 👇👇👇
        if (req.io) {
            console.log(`🔔 [WITHDRAW] Mã ${transCode}: SERVER ĐANG BẮN TIN CHO ADMIN...`);

            req.io.to("admin_room").emit("new_transaction_alert", {
                // Thêm mã code vào tin nhắn
                message: `🔔 [${transCode}] Tài xế RÚT: ${parseInt(amount).toLocaleString('vi-VN')}đ`,
                type: 'withdraw',
                code: transCode
            });
        } else {
            console.log("❌ LỖI: req.io không tồn tại (Kiểm tra lại file server.js phần app.use)");
        }
        // 👆👆👆 KẾT THÚC PHẦN MỚI 👆👆👆

        res.json({ success: true, message: "Đã gửi yêu cầu rút tiền." });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Lỗi rút tiền:", error);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    } finally {
        client.release();
    }
};