import express from "express";
import {
  getWhatsAppStatus,
  getQRCode,
  refreshQRCode,
  sendMessage,
  adminSendBulkMessages,
  logoutWhatsApp,
  checkPreviousDayMessages,
  getStudentsForMessaging,
  sendMessageToStudent
} from "../controllers/messaging.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Simple health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date() });
});

// Get WhatsApp status and QR code
router.get("/status", protect, getWhatsAppStatus);
router.get("/qr", protect, getQRCode);
router.post("/qr/refresh", protect, refreshQRCode);

// Initialize WhatsApp client - this can be called when status shows not ready
router.post("/init", protect, refreshQRCode);

// Messaging endpoints
router.post("/send", protect, sendMessage);
router.post("/bulk", protect, adminSendBulkMessages);
router.post("/send-to-student", protect, sendMessageToStudent);

// Maintenance endpoints
router.post("/logout", protect, logoutWhatsApp);
router.post("/check-previous", protect, checkPreviousDayMessages);
router.get('/students', protect, getStudentsForMessaging);

export default router;