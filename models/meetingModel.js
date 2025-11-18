const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
	userId: { type: String, required: true },
	name: { type: String, required: true },
	approved: { type: Boolean, default: false },
	joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const meetingSchema = new mongoose.Schema({
	roomId: { type: String, unique: true, index: true },
	admin: { type: String, required: true },
	participants: [participantSchema],
	status: { type: String, enum: ['active', 'ended'], default: 'active' },
	createdAt: { type: Date, default: Date.now },
	codeContent: { type: String, default: '' },
	boardEvents: { type: Array, default: [] }
});

module.exports = {};
