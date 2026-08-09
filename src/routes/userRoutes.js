const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  updateProfile,
  changePassword,
  deleteAccount,
  getSettings,
  updateSettings,
} = require('../controllers/userController');

router.use(requireAuth);

/**
 * @swagger
 * /api/v1/users/me:
 *   put:
 *     summary: Update the current user's profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *     responses:
 *       200: { description: Profile updated }
 *   delete:
 *     summary: Permanently delete the current user's account
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Account deleted }
 */
router.put('/me', updateProfile);
router.delete('/me', deleteAccount);

/**
 * @swagger
 * /api/v1/users/me/password:
 *   put:
 *     summary: Change the current user's password
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200: { description: Password updated }
 *       401: { description: Current password incorrect }
 */
router.put('/me/password', changePassword);

/**
 * @swagger
 * /api/v1/users/me/settings:
 *   get:
 *     summary: Get the current user's app settings
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current settings }
 *   put:
 *     summary: Update the current user's app settings
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNotifications: { type: boolean }
 *               maintenanceReminders: { type: boolean }
 *     responses:
 *       200: { description: Settings updated }
 */
router.get('/me/settings', getSettings);
router.put('/me/settings', updateSettings);

module.exports = router;
