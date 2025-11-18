const express = require('express');
const router = express.Router();
const Group = require('../models/groupModel');

// Like an image message in a group
router.post('/likeMessage', async (req, res) => {
  const { groupId, userId, messageIdx } = req.body;
  const group = await Group.findById(groupId);
  if (!group) return res.json({ success: false, error: 'Group not found' });
  const msg = group.messages[messageIdx];
  if (!msg || !msg.imageUrl) return res.json({ success: false, error: 'Message not found or not an image' });
  if (!msg.likes) msg.likes = [];
  if (!msg.dislikes) msg.dislikes = [];
  if (!msg.likes.includes(userId)) msg.likes.push(userId);
  msg.dislikes = msg.dislikes.filter(id => String(id) !== String(userId)); // Remove dislike if present
  await group.save();
  return res.json({ success: true, likes: msg.likes.length, dislikes: msg.dislikes.length });
});

// Dislike an image message in a group
router.post('/dislikeMessage', async (req, res) => {
  const { groupId, userId, messageIdx } = req.body;
  const group = await Group.findById(groupId);
  if (!group) return res.json({ success: false, error: 'Group not found' });
  const msg = group.messages[messageIdx];
  if (!msg || !msg.imageUrl) return res.json({ success: false, error: 'Message not found or not an image' });
  if (!msg.dislikes) msg.dislikes = [];
  if (!msg.likes) msg.likes = [];
  if (!msg.dislikes.includes(userId)) msg.dislikes.push(userId);
  msg.likes = msg.likes.filter(id => String(id) !== String(userId)); // Remove like if present
  await group.save();
  return res.json({ success: true, likes: msg.likes.length, dislikes: msg.dislikes.length });
});

module.exports = router;
