const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();
// Group chat endpoints
const Group = require('../models/groupModel');

const JUDGE0_BASE_URL = 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_HOST = 'judge0-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;

// Map your IDE language strings to Judge0 language_id
const judge0LanguageMap = {
  python: 71,         // Python (3.x)
  java: 62,           // Java
  cpp: 54,            // C++ (GCC)
  c: 50,              // C (GCC)
  nodejs: 63,         // Node.js
  javascript: 63,     // alias if you ever send "javascript"
  typescript: 74      // TypeScript (if enabled in your Judge0)
};


// Create group (creator becomes admin)
router.post('/api/group/create', async (req, res) => {
  const { name, adminId, memberIds, profileImage } = req.body;
  if (!name || !adminId) return res.json({ success: false, error: 'Missing fields' });
  try {
    const uniqueMembers = Array.from(new Set([adminId, ...(memberIds || [])]));
    const group = await Group.create({
      name,
      creator: adminId,
      admins: [adminId],
      members: uniqueMembers,
      profileImage: profileImage || null
    });
    res.json({ success: true, group });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// List groups for user
router.post('/api/group/list', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ success: false, error: 'Missing userId' });
  try {
    const groups = await Group.find({ members: userId });
    res.json({ success: true, groups });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Update group (any admin). Allowed updates: name, profileImage, adminMode, members (replace list) but enforce creator remains admin/member
router.post('/api/group/update', async (req, res) => {
  const { groupId, adminId, updates } = req.body;
  if (!groupId || !adminId || !updates) return res.json({ success: false, error: 'Missing fields' });
  try {
    const group = await Group.findById(groupId);
    if (!group) return res.json({ success: false, error: 'Group not found' });
    if (!group.admins.find(a => String(a) === String(adminId))) return res.json({ success: false, error: 'Not admin' });
    if (updates.name !== undefined) group.name = updates.name;
    if (updates.profileImage !== undefined) group.profileImage = updates.profileImage;
    if (updates.adminMode !== undefined) group.adminMode = !!updates.adminMode;
    if (updates.members) {
      // Ensure creator stays
      const unique = Array.from(new Set(updates.members.map(m => String(m))));
      if (!unique.find(m => m === String(group.creator))) unique.push(String(group.creator));
      group.members = unique;
      // Remove admins no longer members (except creator)
      group.admins = group.admins.filter(a => unique.includes(String(a)) || String(a) === String(group.creator));
    }
    await group.save();
    res.json({ success: true, group });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// Add admin
router.post('/api/group/addAdmin', async (req, res) => {
  const { groupId, requesterId, targetUserId } = req.body;
  if (!groupId || !requesterId || !targetUserId) return res.json({ success: false, error: 'Missing fields' });
  try {
    const group = await Group.findById(groupId);
    if (!group) return res.json({ success: false, error: 'Group not found' });
    if (!group.admins.find(a => String(a) === String(requesterId))) return res.json({ success: false, error: 'Not admin' });
    if (!group.members.find(m => String(m) === String(targetUserId))) return res.json({ success: false, error: 'Target not member' });
    if (!group.admins.find(a => String(a) === String(targetUserId))) group.admins.push(targetUserId);
    await group.save();
    res.json({ success: true, group });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// Remove admin (any admin), cannot remove creator
router.post('/api/group/removeAdmin', async (req, res) => {
  const { groupId, requesterId, targetUserId } = req.body;
  if (!groupId || !requesterId || !targetUserId) return res.json({ success: false, error: 'Missing fields' });
  try {
    const group = await Group.findById(groupId);
    if (!group) return res.json({ success: false, error: 'Group not found' });
    if (!group.admins.find(a => String(a) === String(requesterId))) return res.json({ success: false, error: 'Not admin' });
    if (String(group.creator) === String(targetUserId)) return res.json({ success: false, error: 'Cannot remove creator' });
    group.admins = group.admins.filter(a => String(a) !== String(targetUserId));
    await group.save();
    res.json({ success: true, group });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// Send message (respect adminMode)
router.post('/api/group/sendMessage', async (req, res) => {
  const { groupId, senderId, content, imageUrl } = req.body;
  if (!groupId || !senderId || (!content && !imageUrl)) return res.json({ success: false, error: 'Missing fields' });
  try {
    const group = await Group.findById(groupId);
    if (!group) return res.json({ success: false, error: 'Group not found' });
    if (!group.members.find(m => String(m) === String(senderId))) return res.json({ success: false, error: 'Not a member' });
    if (group.adminMode && !group.admins.find(a => String(a) === String(senderId))) return res.json({ success: false, error: 'Admin only' });
    group.messages.push({ sender: senderId, content, imageUrl });
    await group.save();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// Delete message (any admin)
router.post('/api/group/deleteMessage', async (req, res) => {
  const { groupId, adminId, messageIdx } = req.body;
  if (!groupId || !adminId || messageIdx === undefined) return res.json({ success: false, error: 'Missing fields' });
  try {
    const group = await Group.findById(groupId);
    if (!group) return res.json({ success: false, error: 'Group not found' });
    if (!group.admins.find(a => String(a) === String(adminId))) return res.json({ success: false, error: 'Not admin' });
    group.messages.splice(messageIdx, 1);
    await group.save();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// Leave group; if creator leaves, they remain as inactive member? Instead disallow creator leaving fully.
router.post('/api/group/leave', async (req, res) => {
  const { groupId, userId } = req.body;
  if (!groupId || !userId) return res.json({ success: false, error: 'Missing fields' });
  try {
    const group = await Group.findById(groupId);
    if (!group) return res.json({ success: false, error: 'Group not found' });
    if (String(group.creator) === String(userId)) return res.json({ success: false, error: 'Creator cannot leave group' });
    group.members = group.members.filter(m => String(m) !== String(userId));
    group.admins = group.admins.filter(a => String(a) !== String(userId));
    await group.save();
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});
const multer = require('multer');
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var userModel = require("../models/userModel");
var projectModel = require("../models/projectModel");
var { exec } = require("child_process");
const dotenv = require('dotenv');
var fs = require("fs");
var path = require("path");
var fileCleanupMonitor = require("../utils/fileCleanupMonitor");
var chatModel = require("../models/chatModel");
var userProfileModel = require("../models/userProfileModel");
var followModel = require("../models/followModel");
var communityPostModel = require("../models/communityPostModel");
var friendRequestModel = require("../models/friendRequestModel");
const fetch = require('node-fetch'); // Add at the top
// Get profile stats
router.post('/getProfileStats', async (req, res) => {
  const { userId } = req.body;
  // Replace with real stats logic if needed
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
  // Example: return dummy stats
  res.json({ success: true, stats: { posts: 0, likes: 0, userId } });
});

// ...existing code...
// Get user details
router.post('/getUserDetails', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
  const user = await userModel.findById(userId);
  if (user) {
    return res.json({ success: true, user });
  } else {
    return res.json({ success: false, message: 'User not found!' });
  }
});

// Get user profile
router.post('/getProfile', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    let profile = await userProfileModel.findOne({ userId });
    if (!profile) {
      // Create minimal profile from user record with default avatar if available
      const user = await userModel.findById(userId);
      if (user) {
        profile = await userProfileModel.create({
          userId,
          username: user.username || user.name || '',
          joinDate: user.date || Date.now(),
          profilePicture: user.avatar || undefined
        });
      }
    } else {
      // Backfill missing avatar from OAuth user record
      if (!profile.profilePicture) {
        const user = await userModel.findById(userId).select('avatar');
        if (user && user.avatar) {
          profile.profilePicture = user.avatar;
          await profile.save();
        }
      }
    }
    if (profile) return res.json({ success: true, profile });
    return res.json({ success: false, message: 'Profile not found!' });
  } catch (e) {
    console.error('Error in getProfile:', e);
    return res.json({ success: false, message: 'Error fetching profile', error: e.message });
  }
});

// List friends
router.post('/friends/list', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
  // Find accepted friend requests
  const requests = await friendRequestModel.find({
    $or: [ { from: userId }, { to: userId } ], status: 'accepted'
  }).populate('from to', 'username name');
  // Get the other user in each request
  const contacts = requests.map(r => {
    const fromUser = r.from || null;
    const toUser = r.to || null;
    // Determine which side is the "other" contact relative to the requester
    let other = null;
    if (fromUser && toUser) {
      other = String(fromUser._id) === String(userId) ? toUser : fromUser;
    } else if (fromUser && String(fromUser._id) !== String(userId)) {
      other = fromUser;
    } else if (toUser && String(toUser._id) !== String(userId)) {
      other = toUser;
    }
    if (!other) return null; // skip malformed records
    return { userId: other._id, name: other.username || other.name || 'Unknown' };
  }).filter(Boolean);
  return res.json({ success: true, contacts });
});

// List friend requests
router.post('/friends/requests', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
  // Incoming requests
  const incoming = await friendRequestModel.find({ to: userId, status: 'pending' }).populate('from', 'username name');
  // Outgoing requests
  const outgoing = await friendRequestModel.find({ from: userId, status: 'pending' }).populate('to', 'username name');
  return res.json({ success: true, incoming, outgoing });
});

// Follow a user
router.post('/api/follow', async (req, res) => {
  const { userId, otherId } = req.body;
  if (!userId || !otherId) return res.json({ success: false, message: 'Missing fields' });
  try {
    // create follow if not exists
    const doc = await followModel.findOneAndUpdate({ follower: userId, followee: otherId }, { $setOnInsert: { follower: userId, followee: otherId } }, { upsert: true, new: true });
    // increment counts
    await userProfileModel.findOneAndUpdate({ userId: otherId }, { $inc: { 'communityInteraction.followers': 1 } }, { upsert: true });
    await userProfileModel.findOneAndUpdate({ userId }, { $inc: { 'communityInteraction.following': 1 } }, { upsert: true });
    res.json({ success: true });
  } catch (e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// Unfollow a user
router.post('/api/unfollow', async (req, res) => {
  const { userId, otherId } = req.body;
  if (!userId || !otherId) return res.json({ success: false, message: 'Missing fields' });
  try {
    await followModel.deleteOne({ follower: userId, followee: otherId });
    await userProfileModel.findOneAndUpdate({ userId: otherId }, { $inc: { 'communityInteraction.followers': -1 } });
    await userProfileModel.findOneAndUpdate({ userId }, { $inc: { 'communityInteraction.following': -1 } });
    res.json({ success: true });
  } catch (e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// Get follow status between me and other
router.post('/api/follow/status', async (req, res) => {
  const { userId, otherId } = req.body;
  if (!userId || !otherId) return res.json({ success: false, message: 'Missing fields' });
  try {
    const following = !!(await followModel.findOne({ follower: userId, followee: otherId }));
    const followedBy = !!(await followModel.findOne({ follower: otherId, followee: userId }));
    res.json({ success: true, following, mutual: following && followedBy });
  } catch (e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// Send image as base64 and save in chat
router.post('/chat/sendImageBase64', async (req, res) => {
  try {
    const { chatId, senderId, imageBase64 } = req.body;
    if (!chatId || !senderId || !imageBase64) return res.json({ success: false, message: 'Missing fields' });
    const chat = await chatModel.findById(chatId);
    if (!chat) return res.json({ success: false, message: 'Chat not found' });
    if (!chat.participants.map(p => p.toString()).includes(senderId)) return res.json({ success: false, message: 'Not a participant' });
    chat.messages.push({ sender: senderId, content: '[Image]', imageUrl: imageBase64 });
    chat.updatedAt = new Date();
    await chat.save();
    return res.json({ success: true });
  } catch (e) {
    return res.json({ success: false, message: e.message });
  }
});


// Cleanup utility functions
const cleanupTempFiles = (filePaths) => {
  filePaths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        fileCleanupMonitor.logFileDeletion(path.basename(filePath));
        console.log(`Cleaned up temp file: ${filePath}`);
      } catch (cleanupError) {
        fileCleanupMonitor.logCleanupError(path.basename(filePath), cleanupError);
        console.error(`Error cleaning up temp file ${filePath}:`, cleanupError);
      }
    }
  });
};

const cleanupOldTempFiles = (tempDir, maxAge = 3600000) => { // 1 hour in milliseconds
  try {
    if (!fs.existsSync(tempDir)) return;
    
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          fileCleanupMonitor.logFileDeletion(file);
          console.log(`Cleaned up old temp file: ${filePath}`);
        }
      } catch (error) {
        fileCleanupMonitor.logCleanupError(file, error);
        console.error(`Error checking/cleaning temp file ${filePath}:`, error);
      }
    });
  } catch (error) {
    console.error('Error during temp directory cleanup:', error);
  }
};

// Periodic cleanup of old temporary files (every 30 minutes)
setInterval(() => {
  const tempDir = path.join(__dirname, '..', 'temp');
  cleanupOldTempFiles(tempDir);
}, 30 * 60 * 1000);

// Cleanup on process exit
process.on('exit', () => {
  console.log('Process exiting, cleaning up temporary files...');
  const tempDir = path.join(__dirname, '..', 'temp');
  cleanupOldTempFiles(tempDir, 0); // Clean all files on exit
});

// Create or update profile (used by Profile page)
router.post('/createOrUpdateProfile', async (req,res)=>{
  try {
    const { userId, profile } = req.body;
    if(!userId) return res.json({ success:false, message:'userId required'});
    let existing = await userProfileModel.findOne({ userId });
    if(!existing){
      existing = await userProfileModel.create({ userId, ...profile, joinDate: profile?.joinDate || Date.now() });
    } else {
      Object.assign(existing, profile||{});
      await existing.save();
    }
    return res.json({ success:true, message:'Profile saved', profile: existing });
  } catch(e){
    return res.json({ success:false, message:'Error saving profile', error:e.message });
  }
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up temporary files...');
  const tempDir = path.join(__dirname, '..', 'temp');
  cleanupOldTempFiles(tempDir, 0);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up temporary files...');
  const tempDir = path.join(__dirname, '..', 'temp');
  cleanupOldTempFiles(tempDir, 0);
  process.exit(0);
});

/* GET home page. */
router.get('/', function (req, res) {
  res.json({
    success: true,
    message: 'Backend is running 🚀'
  });
});

const secret = "secret"; // secret key for jwt

router.post("/signUp", async (req, res) => {
  let { username, name, email, password } = req.body;
  let emailCon = await userModel.findOne({ email: email });
  if (emailCon) {
    return res.json({ success: false, message: "Email already exists" });
  }
  else {

    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(password, salt, function (err, hash) {
        let user = userModel.create({
          username: username,
          name: name,
          email: email,
          password: hash
        });

        return res.json({ success: true, message: "User created successfully" });
      });
    });

  }
});

router.post("/login", async (req, res) => {
  let { email, password } = req.body;
  console.log('[LOGIN] Attempt:', { email });
  let user = await userModel.findOne({ email: email });
  if (!user) {
    console.log('[LOGIN] User not found:', email);
    return res.json({ success: false, message: "User not found!" });
  }
  console.log('[LOGIN] User found:', user.email);
  bcrypt.compare(password, user.password, async function (err, isMatch) {
    if (err) {
      console.log('[LOGIN] Bcrypt error:', err);
      return res.json({ success: false, message: "An error occurred", error: err });
    }
    if (isMatch) {
      let token = jwt.sign({ email: user.email, userId: user._id }, secret);
      try {
        await userModel.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
      } catch (e) {
        console.log('[LOGIN] Last login update error:', e);
      }
      console.log('[LOGIN] Success:', user.email);
      return res.json({ success: true, message: "User logged in successfully", token: token, userId: user._id });
    } else {
      console.log('[LOGIN] Invalid password for:', user.email);
      return res.json({ success: false, message: "Invalid email or password" });
    }
  });
});

// Basic user search (public minimal fields)
router.post('/searchUsers', async (req,res)=>{
  try {
    const { query } = req.body;
    if (!query || query.length < 2) return res.json({ success:true, users: [] });
    const { escapeRegex } = require('../utils/regex');
    const safe = escapeRegex(query);
    const regex = new RegExp(safe, 'i');
    const users = await userModel.find({ $or:[ { username: regex }, { name: regex } ] }).limit(20).select('username name');
    return res.json({ success:true, users });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

router.post("/getUserDetails", async (req, res) => {
  console.log("Called")
  let { userId } = req.body;
  let user = await userModel.findOne({ _id: userId });
  if (user) {
    return res.json({ success: true, message: "User details fetched successfully", user: user });
  } else {
    return res.json({ success: false, message: "User not found!" });
  }
});

// Create or update a user profile
router.post('/createOrUpdateProfile', async (req, res) => {
  try {
    const { userId } = req.body;
    // Accept either a `profile` object or top-level fields
    const profilePayload = req.body.profile || req.body;
    if (!userId) return res.json({ success: false, message: 'userId is required' });

    // Prevent accidental overwrite of userId
    delete profilePayload.userId;

    const profile = await userProfileModel.findOneAndUpdate(
      { userId },
      { $set: profilePayload, $setOnInsert: { joinDate: new Date() } },
      { new: true, upsert: true }
    );

    // If profile picture provided, keep User.avatar in sync (useful for OAuth users)
    if (profilePayload.profilePicture) {
      try {
        await userModel.updateOne({ _id: userId }, { $set: { avatar: profile.profilePicture } });
      } catch (e) { /* non-blocking */ }
    }

    return res.json({ success: true, message: 'Profile saved successfully', profile });
  } catch (error) {
    console.error('Error in createOrUpdateProfile:', error);
    return res.json({ success: false, message: 'Error saving profile', error: error.message });
  }
});

// Fetch a user profile by userId
router.post('/getProfile', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false, message: 'userId is required' });

    let profile = await userProfileModel.findOne({ userId });

    // If profile doesn't exist, create a minimal profile from user record with avatar default
    if (!profile) {
      const user = await userModel.findById(userId);
      if (user) {
        profile = await userProfileModel.create({
          userId,
          username: user.username || user.name || '',
          joinDate: user.date || Date.now(),
          profilePicture: user.avatar || undefined
        });
      }
    } else if (!profile.profilePicture) {
      // Backfill from user avatar if missing
      const user = await userModel.findById(userId).select('avatar');
      if (user && user.avatar) {
        profile.profilePicture = user.avatar;
        await profile.save();
      }
    }

    return res.json({ success: true, message: 'Profile fetched successfully', profile });
  } catch (error) {
    console.error('Error in getProfile:', error);
    return res.json({ success: false, message: 'Error fetching profile', error: error.message });
  }
});

// ---------------- Community Posts ----------------
router.post('/community/createPost', async (req, res) => {
  try {
    const { userId, content, imageBase64 } = req.body;
    if (!userId || !content) return res.json({ success: false, message: 'userId & content required' });
    const user = await userModel.findById(userId);
    if (!user) return res.json({ success: false, message: 'User not found' });
    const post = await communityPostModel.create({ author: userId, authorName: user.username || user.name, content, imageBase64 });
    return res.json({ success: true, post });
  } catch (e) { return res.json({ success: false, message: e.message }); }
});

router.post('/community/list', async (req, res) => {
  try {
    const posts = await communityPostModel.find().sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, posts });
  } catch (e) { return res.json({ success: false, message: e.message }); }
});

router.post('/community/comment', async (req, res) => {
  try {
    const { userId, postId, content } = req.body;
    if (!userId || !postId || !content) return res.json({ success: false, message: 'Missing fields' });
    const user = await userModel.findById(userId);
    const post = await communityPostModel.findById(postId);
    if (!user || !post) return res.json({ success: false, message: 'Not found' });
    post.comments.push({ user: userId, username: user.username || user.name, content });
    await post.save();
    return res.json({ success: true, post });
  } catch (e) { return res.json({ success: false, message: e.message }); }
});

// --------------- Friend Requests / Contacts ---------------
router.post('/friends/sendRequest', async (req,res)=>{
  try {
    const { fromId, toId } = req.body;
    if (!fromId || !toId) return res.json({ success:false, message:'fromId & toId required'});
    if (fromId === toId) return res.json({ success:false, message:'Cannot friend yourself'});
    const existing = await friendRequestModel.findOne({ from: fromId, to: toId });
    const reverse = await friendRequestModel.findOne({ from: toId, to: fromId });
    if (existing) return res.json({ success:true, message:'Request already sent', request: existing });
    if (reverse && reverse.status === 'pending') return res.json({ success:true, message:'User already sent you a request', request: reverse });
    if (reverse && reverse.status === 'accepted') return res.json({ success:true, message:'Already friends', request: reverse });
    const fr = await friendRequestModel.create({ from: fromId, to: toId });
    return res.json({ success:true, request: fr });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

router.post('/friends/requests', async (req,res)=>{
  try {
    const { userId } = req.body;
    const incoming = await friendRequestModel.find({ to: userId, status:'pending'}).populate('from','username name');
    const outgoing = await friendRequestModel.find({ from: userId, status:'pending'}).populate('to','username name');
    return res.json({ success:true, incoming, outgoing });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

router.post('/friends/act', async (req,res)=>{
  try {
    const { requestId, action, userId } = req.body; // action: accept|reject
    const fr = await friendRequestModel.findById(requestId);
    if (!fr) return res.json({ success:false, message:'Request not found'});
    if (fr.to.toString() !== userId) return res.json({ success:false, message:'Not authorized'});
    if (!['accept','reject'].includes(action)) return res.json({ success:false, message:'Invalid action'});
    fr.status = action === 'accept' ? 'accepted' : 'rejected';
    fr.updatedAt = new Date();
    await fr.save();
    return res.json({ success:true, request: fr });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

router.post('/friends/list', async (req,res)=>{
  try {
    const { userId } = req.body;
    const accepted = await friendRequestModel.find({ $or:[{ from:userId, to:{$exists:true}, status:'accepted'},{ to:userId, from:{$exists:true}, status:'accepted'}]}).populate('from to','username name');
    const contacts = accepted.map(fr => {
      const other = fr.from._id.toString() === userId ? fr.to : fr.from;
      return { userId: other._id, name: other.username || other.name };
    });
    return res.json({ success:true, contacts });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

// --------------- Direct Chats ---------------
router.post('/chat/open', async (req,res)=>{
  try {
    const { userId, otherUserId } = req.body;
    if (!userId || !otherUserId) return res.json({ success:false, message:'userId & otherUserId required'});
    const fr = await friendRequestModel.findOne({ $or:[{ from:userId, to:otherUserId, status:'accepted'},{ from:otherUserId, to:userId, status:'accepted'}]});
    if (!fr) return res.json({ success:false, message:'Not friends'});
    let chat = await chatModel.findOne({ participants: { $all:[userId, otherUserId], $size:2 } });
    if (!chat) chat = await chatModel.create({ participants:[userId, otherUserId], messages:[] });
    return res.json({ success:true, chat });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

router.post('/chat/list', async (req,res)=>{
  try {
    const { userId } = req.body;
    const chats = await chatModel.find({ participants: userId }).sort({ updatedAt:-1 }).limit(50).populate('participants','username name');
    return res.json({ success:true, chats });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

router.post('/chat/send', async (req,res)=>{
  try {
    const { chatId, senderId, content } = req.body;
    if (!chatId || !senderId || !content) return res.json({ success:false, message:'Missing fields'});
    const chat = await chatModel.findById(chatId);
    if (!chat) return res.json({ success:false, message:'Chat not found'});
    if (!chat.participants.map(p=>p.toString()).includes(senderId)) return res.json({ success:false, message:'Not a participant'});
    chat.messages.push({ sender: senderId, content });
    chat.updatedAt = new Date();
    await chat.save();
    const otherId = chat.participants.find(p=>p.toString() !== senderId).toString();
    for (const uid of chat.participants) {
      await userProfileModel.findOneAndUpdate(
        { userId: uid },
        { $pull: { recentMessages: { chatId: chat._id } } }
      );
      await userProfileModel.findOneAndUpdate(
        { userId: uid },
        { $push: { recentMessages: { chatId: chat._id, counterpart: uid.toString() === senderId ? otherId : senderId, lastMessage: content, updatedAt: new Date() } } },
        { upsert: true }
      );
    }
    return res.json({ success:true, chat });
  } catch(e){ return res.json({ success:false, message:e.message }); }
});

router.post("/createProject", async (req, res) => {
  try {
    let { userId, title, language } = req.body;
    
    console.log("Create Project Request:", { userId, title, language });
    
    let user = await userModel.findOne({ _id: userId });
    if (!user) {
      return res.json({ success: false, message: "User not found!" });
    }
    
    // Set default code based on language
    let defaultCode = "";
    switch(language) {
      case "python":
        defaultCode = `# Python Code
print("Hello, World!")

# Example function
def greet(name):
    return f"Hello, {name}!"

# Call the function
message = greet("Python")
print(message)`;
        break;
      case "java":
        defaultCode = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Example method
        String message = greet("Java");
        System.out.println(message);
    }
    
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }
}`;
        break;
      case "cpp":
        defaultCode = `#include <iostream>
#include <string>

using namespace std;

// Function declaration
string greet(string name);

int main() {
    cout << "Hello, World!" << endl;
    
    // Example usage
    string message = greet("C++");
    cout << message << endl;
    
    return 0;
}

// Function definition
string greet(string name) {
    return "Hello, " + name + "!";
}`;
        break;
      case "c":
        defaultCode = `#include <stdio.h>
#include <string.h>

// Function declaration
void greet(char* name);

int main() {
    printf("Hello, World!\\n");
    
    // Example usage
    greet("C");
    
    return 0;
}

// Function definition
void greet(char* name) {
    printf("Hello, %s!\\n", name);
}`;
        break;
      case "nodejs":
        defaultCode = `// Node.js Code
console.log("Hello, World!");

// Example function
function greet(name) {
    return \`Hello, \${name}!\`;
}

// Example with async/await
async function fetchData() {
    // Simulate async operation
    return new Promise(resolve => {
        setTimeout(() => {
            resolve("Data fetched successfully!");
        }, 1000);
    });
}

// Call the function
const message = greet("Node.js");
console.log(message);

// Example async call
fetchData().then(data => {
    console.log(data);
});`;
        break;
      case "typescript":
        defaultCode = `// TypeScript Code
console.log("Hello, World!");

// Example interface
interface Person {
    name: string;
    age: number;
}

// Example function with types
function greet(name: string): string {
    return \`Hello, \${name}!\`;
}

// Example class
class Calculator {
    add(a: number, b: number): number {
        return a + b;
    }
    
    multiply(a: number, b: number): number {
        return a * b;
    }
}

// Usage
const message: string = greet("TypeScript");
console.log(message);

const calc = new Calculator();
console.log("2 + 3 =", calc.add(2, 3));
console.log("4 * 5 =", calc.multiply(4, 5));`;
        break;
      default:
        defaultCode = "";
    }

    let project = await projectModel.create({
      title: title,
      createdBy: userId,
      language: language || "web",
      code: defaultCode
    });

    console.log("Project created:", project._id);
    return res.json({ success: true, message: "Project created successfully", projectId: project._id });
    
  } catch (error) {
    console.error("Error creating project:", error);
    return res.json({ success: false, message: "Error creating project", error: error.message });
  }
});

router.post("/getProjects", async (req, res) => {
  let { userId } = req.body;
  let user = await userModel.findOne({ _id: userId });
  if (user) {
    let projects = await projectModel.find({ createdBy: userId });
    return res.json({ success: true, message: "Projects fetched successfully", projects: projects });
  }
  else {
    return res.json({ success: false, message: "User not found!" });
  }
});

router.post("/deleteProject", async (req, res) => {
  let {userId, progId} = req.body;
  let user = await userModel.findOne({ _id: userId });
  if (user) {
    let project = await projectModel.findOneAndDelete({ _id: progId });
    return res.json({ success: true, message: "Project deleted successfully" });
  }
  else {
    return res.json({ success: false, message: "User not found!" });
  }
});

router.post("/getProject", async (req, res) => {
  let {userId,projId} = req.body;
  let user = await userModel.findOne({ _id: userId });
  if (user) {
    let project = await projectModel.findOne({ _id: projId });
    return res.json({ success: true, message: "Project fetched successfully", project: project });
  }
  else{
    return res.json({ success: false, message: "User not found!" });
  }
});

router.post("/updateProject", async (req, res) => {
  let { userId, htmlCode, cssCode, jsCode, code, projId, output, input } = req.body;
  let user = await userModel.findOne({ _id: userId });

  if (user) {
    let updateData = {};
    
    // Update based on what's provided
    if (htmlCode !== undefined) updateData.htmlCode = htmlCode;
    if (cssCode !== undefined) updateData.cssCode = cssCode;
    if (jsCode !== undefined) updateData.jsCode = jsCode;
    if (code !== undefined) updateData.code = code;
    if (output !== undefined) updateData.output = output;
    if (input !== undefined) updateData.input = input;

    let project = await projectModel.findOneAndUpdate(
      { _id: projId },
      updateData,
      { new: true }
    );

    if (project) {
      return res.json({ success: true, message: "Project updated successfully" });
    } else {
      return res.json({ success: false, message: "Project not found!" });
    }
  } else {
    return res.json({ success: false, message: "User not found!" });
  }
});


router.post("/executeCode", async (req, res) => {
  const { userId, projId, code, language, input } = req.body;

  try {
    // 1) Validate user
    const user = await userModel.findById(userId);
    if (!user) {
      return res.json({ success: false, message: "User not found!" });
    }

    // 2) Resolve Judge0 API key (support multiple env var names)
    const apiKey = process.env.JUDGE0_API_KEY || process.env.JUDGE0_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      return res.json({
        success: false,
        message: "Judge0 API key is not configured on server",
      });
    }

    // 3) Map language -> Judge0 language_id
    const language_id = judge0LanguageMap[language];
    if (!language_id) {
      return res.json({
        success: false,
        message: `Language "${language}" is not supported`,
      });
    }

    // 4) Prepare payload for Judge0 (base64)
    const payload = {
      language_id,
      source_code: Buffer.from(code || "", "utf-8").toString("base64"),
      stdin: input
        ? Buffer.from(input, "utf-8").toString("base64")
        : undefined,
    };

    // 5) Call Judge0
    const headers = {
      "Content-Type": "application/json",
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": JUDGE0_HOST,
    };

    const params = {
      base64_encoded: "true",
      wait: "true", // sync: Judge0 waits and returns result immediately
    };

    const judgeRes = await axios.post(
      `${JUDGE0_BASE_URL}/submissions`,
      payload,
      { headers, params }
    );

    const data = judgeRes.data;

    const decode = (val) =>
      val ? Buffer.from(val, "base64").toString("utf-8") : "";

    const stdout = decode(data.stdout);
    const stderr = decode(data.stderr);
    const compile_output = decode(data.compile_output);
    const status = data.status?.description || "Unknown";

    // 6) Prepare output & error like your old route
    let output = "";
    let error = "";

    if (compile_output) {
      error = compile_output;
      output = compile_output;
    } else if (stderr) {
      error = stderr;
      output = stderr;
    } else if (stdout) {
      output = stdout;
    } else {
      output = `Status: ${status}\n(no output)`;
    }

    // 7) Save output to project (same as before)
    if (projId) {
      await projectModel.findOneAndUpdate(
        { _id: projId },
        {
          output: output,
          code: code,
          input: input || "",
        }
      );
    }

    // 8) Respond to frontend
    return res.json({
      success: true,
      message: "Code executed via Judge0",
      output,
      error: error || null,
      judge0Status: status,
    });
  } catch (err) {
    // Prefer informative error body when available
    const judgeErr = err.response?.data || err;
    console.error("Judge0 executeCode error:", judgeErr);

    // Ensure we return a string (not an object) to the frontend
    let errorText = '';
    if (typeof judgeErr === 'string') errorText = judgeErr;
    else {
      try {
        errorText = JSON.stringify(judgeErr);
      } catch (e) {
        errorText = String(judgeErr);
      }
    }

    // Detect RapidAPI subscription error and return actionable guidance
    const lowered = (errorText || '').toLowerCase();
    if (lowered.includes('not subscribed') || lowered.includes('you are not subscribed')) {
      return res.json({
        success: false,
        message: 'Execution failed - RapidAPI subscription required for Judge0',
        error: 'Your RapidAPI key is not subscribed to the Judge0 API. To fix: 1) Subscribe to the Judge0 (judge0-ce) API on RapidAPI (https://rapidapi.com). 2) Use the RapidAPI key in backend `.env` (RAPIDAPI_KEY or JUDGE0_RAPIDAPI_KEY). 3) Restart the backend. Alternatively, self-host Judge0 and set `JUDGE0_URL` to your instance.',
      });
    }

    return res.json({
      success: false,
      message: 'Execution failed',
      error: errorText,
    });
  }
});


// User search by username (partial, case-insensitive)
router.get('/searchUsers', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.json({ success: false, message: 'Query too short' });
  }
  const { escapeRegex } = require('../utils/regex');
  const safe = escapeRegex(q);
  const users = await userModel.find({
    username: { $regex: safe, $options: 'i' }
  }, '_id username name');
  // Increment searchCount for matching profiles (best-effort)
  try {
    const ids = users.map(u => u._id);
    await userProfileModel.updateMany({ userId: { $in: ids } }, { $inc: { searchCount: 1 } });
  } catch (e) { console.error('Failed updating searchCount', e); }
  res.json({ success: true, users });
});

// Default search page data: most searched and most followed
router.get('/search/default', async (req, res) => {
  try {
    const mostSearched = await userProfileModel.find().sort({ searchCount: -1 }).limit(8).select('userId username profilePicture searchCount');
    // Most followed computed by aggregation on followModel
    const mostFollowedAgg = await followModel.aggregate([
      { $group: { _id: '$followee', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'userprofiles', localField: '_id', foreignField: 'userId', as: 'profile' } },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$_id', count: 1, username: '$profile.username', profilePicture: '$profile.profilePicture' } }
    ]);
    res.json({ success: true, mostSearched, mostFollowed: mostFollowedAgg });
  } catch (e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// Get or create a chat between two users
router.post('/chat/start', async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) return res.json({ success: false, message: 'Missing userId or friendId' });
  // Check if a mutual follow exists
  const follows1 = await followModel.findOne({ follower: userId, followee: friendId });
  const follows2 = await followModel.findOne({ follower: friendId, followee: userId });
  const mutual = !!(follows1 && follows2);
  let chat = await chatModel.findOne({
    participants: { $all: [userId, friendId], $size: 2 }
  });
  if (!chat) {
    chat = await chatModel.create({ participants: [userId, friendId], messages: [], oneOff: !mutual });
  }
  res.json({ success: true, chat });
});

// Send a message in a chat
router.post('/chat/send', async (req, res) => {
  const { chatId, senderId, content } = req.body;
  if (!chatId || !senderId || !content) return res.json({ success: false, message: 'Missing fields' });
  const chat = await chatModel.findById(chatId);
  if (!chat) return res.json({ success: false, message: 'Chat not found' });
  // If chat is oneOff and already used, prevent further messages
  if (chat.oneOff && chat.oneOffUsed) return res.json({ success: false, message: 'One-off chat already used' });
  chat.messages.push({ sender: senderId, content });
  chat.updatedAt = new Date();
  // Mark oneOffUsed after first message
  if (chat.oneOff) chat.oneOffUsed = true;
  await chat.save();
  res.json({ success: true, chat });
});

// Get messages for a chat
router.get('/chat/messages', async (req, res) => {
  const { chatId } = req.query;
  if (!chatId) return res.json({ success: false, message: 'Missing chatId' });
  const chat = await chatModel.findById(chatId).populate('messages.sender', 'username name');
  if (!chat) return res.json({ success: false, message: 'Chat not found' });
  res.json({ success: true, messages: chat.messages });
});

// Gemini Chatbot endpoint
router.post('/chatbot/gemini', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'Message is required' });
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_CHAT_KEY;
  if (!apiKey) {
    console.error('Gemini API key not set.');
    return res.status(500).json({ success: false, error: 'Gemini API key not set' });
  }

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyC3jNobx2uiRxsQgbw978_5Pk9F1Tt-kZc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });
    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      console.error('Gemini API error:', data);
      return res.status(500).json({ success: false, error: data.error ? data.error.message : 'Unknown Gemini API error', details: data });
    }
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      return res.json({ success: true, response: data.candidates[0].content.parts[0].text });
    } else {
      console.error('No response from Gemini:', data);
      return res.status(500).json({ success: false, error: 'No response from Gemini', details: data });
    }
  } catch (err) {
    console.error('Gemini fetch error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Cleanup monitoring endpoint for production debugging
router.get("/cleanup-status", (req, res) => {
  try {
    const stats = fileCleanupMonitor.getStats();
    const fileDetails = fileCleanupMonitor.getFileDetails();
    
    res.json({
      success: true,
      stats: stats,
      currentFiles: fileDetails,
      message: "File cleanup status retrieved successfully"
    });
  } catch (error) {
    res.json({
      success: false,
      message: "Error getting cleanup status",
      error: error.message
    });
  }
});

// Force cleanup endpoint for production maintenance
router.post("/force-cleanup", (req, res) => {
  try {
    fileCleanupMonitor.forceCleanup();
    const stats = fileCleanupMonitor.getStats();
    
    res.json({
      success: true,
      stats: stats,
      message: "Force cleanup completed successfully"
    });
  } catch (error) {
    res.json({
      success: false,
      message: "Error during force cleanup",
      error: error.message
    });
  }
});

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, '../temp'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Endpoint to handle avatar uploads
router.post('/uploadAvatar', upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/temp/${req.file.filename}`;
    return res.json({ success: true, message: 'File uploaded successfully', fileUrl });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({ success: false, message: 'Error uploading file', error: error.message });
  }
});

module.exports = router;
