// C:\Users\Admin\carpool-api\utils\pushNotification.js

const { Expo } = require('expo-server-sdk');

// Tạo instance Expo SDK
const expo = new Expo();

const sendPushNotification = async (pushToken, message, data = {}) => {
    // 1. Kiểm tra Token có hợp lệ không
    if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`❌ Push token ${pushToken} không hợp lệ (Không phải Expo Token).`);
        return;
    }

    // 2. Tạo tin nhắn thông báo (Đã cấu hình tối ưu cho iOS & Android)
    const messages = [{
        to: pushToken,
        sound: 'default', // Âm thanh mặc định
        title: '🚖 CÓ KHÁCH MỚI!',
        body: message,
        data: data, // Dữ liệu đi kèm (ví dụ bookingId để mở app load lại)
        priority: 'high',
        badge: 1, // 🔴 iOS: Hiện số 1 màu đỏ trên icon ứng dụng

        // Cấu hình riêng cho Android
        android: {
            channelId: 'booking-channel', // Quan trọng để rung mạnh
            vibrate: [0, 250, 250, 250],  // Rung: nghỉ-rung-nghỉ-rung
            color: '#00B14F',             // Màu icon trên thanh thông báo
            priority: 'high'
        },

        // Cấu hình riêng cho iOS
        ios: {
            sound: 'default',
            _displayInForeground: true // Cho phép hiện thông báo ngay cả khi đang mở App
        }
    }];

    // 3. Gửi thông báo (Chia thành các chunk để gửi hiệu quả)
    const chunks = expo.chunkPushNotifications(messages);

    for (let chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            console.log("✅ Đã gửi Push Notification thành công:", ticketChunk);
        } catch (error) {
            console.error("❌ Lỗi khi gửi Push Notification:", error);
        }
    }
};

module.exports = { sendPushNotification };