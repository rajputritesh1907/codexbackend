const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('../config/passport');

// Helpers
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'dev_jwt_secret';

function buildRedirect(user) {
	const token = jwt.sign({ email: user.email, userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
	const url = new URL(FRONTEND_URL + '/oauth/callback');
	url.searchParams.set('token', token);
	url.searchParams.set('userId', user._id.toString());
	return url.toString();
}

// Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], state: 'google' }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: FRONTEND_URL + '/login?error=google_auth_failed' }), (req, res) => {
	try {
		res.redirect(buildRedirect(req.user));
	} catch (e) {
		res.redirect(FRONTEND_URL + '/login?error=google_auth_failed');
	}
});

// GitHub
router.get('/github', passport.authenticate('github', { scope: ['user:email'], state: 'github' }));
router.get('/github/callback', passport.authenticate('github', { failureRedirect: FRONTEND_URL + '/login?error=github_auth_failed' }), (req, res) => {
	try {
		res.redirect(buildRedirect(req.user));
	} catch (e) {
		res.redirect(FRONTEND_URL + '/login?error=github_auth_failed');
	}
});

module.exports = router;
