const express = require('express');
const router = express.Router();
const Admin = require('../models/adminModel');
const User = require('../models/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Project = require('../models/projectModel');
const CommunityPost = require('../models/communityPostModel');
const UserProfile = require('../models/userProfileModel');
const FriendRequest = require('../models/friendRequestModel');

// Debug + attach admin identity if JWT provided
router.use((req, res, next) => {
  try {
    let token = req.headers['x-admin-token'] || req.query.adminToken || null;
    if (!req.session?.adminId && token) {
      try {
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET || 'dev_admin_jwt_secret');
        req.jwtAdminId = decoded.adminId;
      } catch {}
    }
    console.log('[AdminRoute]', req.method, req.originalUrl, 'session.adminId=', req.session && req.session.adminId, 'jwtAdminId=', req.jwtAdminId);
  } catch {}
  next();
});

// Helper to determine authenticated admin id (session or jwt)
function getAdminId(req){
  return (req.session && req.session.adminId) || req.jwtAdminId || null;
}

// Admin Signup
router.post('/signup', async (req, res) => {
  const { adminId, password } = req.body || {};
  if (!adminId || !password) {
    return res.status(400).json({ success: false, message: 'adminId and password are required' });
  }
  try {
    const existing = await Admin.findOne({ adminId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Admin already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ adminId, password: hashedPassword });
    await admin.save();
    res.status(201).json({ success: true, message: 'Admin registered successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Admin Login
router.post('/login', async (req, res) => {
  const { adminId, password } = req.body || {};
  if (!adminId || !password) {
    return res.status(400).json({ success: false, message: 'adminId and password are required' });
  }
  try {
    const admin = await Admin.findOne({ adminId });
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });
      if (req.session) {
        req.session.adminId = adminId;
        req.session.save(() => {});
      }
    const adminToken = jwt.sign({ adminId }, process.env.ADMIN_JWT_SECRET || 'dev_admin_jwt_secret', { expiresIn: '8h' });
    res.json({ success: true, message: 'Login successful', adminToken });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Session info
router.get('/me', (req, res) => {
  const aid = getAdminId(req);
  if (!aid) return res.status(401).json({ success:false, message:'Unauthorized'});
  res.json({ success:true, adminId: aid });
});

// Get User List (protected)
router.get('/users', async (req, res) => {
  const aid = getAdminId(req);
  if (!aid) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    // Prevent caching of sensitive user list responses
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
    const users = await User.find({}, 'username email password lastLogin date');
    // Batch fetch profiles for avatars
    const userIds = users.map(u => u._id);
    const profiles = await UserProfile.find({ userId: { $in: userIds } }, 'userId profilePicture');
    const avatarMap = new Map();
    profiles.forEach(p => avatarMap.set(String(p.userId), p.profilePicture));
    const enriched = users.map(u => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      password: u.password, // hashed
      lastLogin: u.lastLogin,
      date: u.date,
      profilePicture: avatarMap.get(String(u._id)) || null
    }));
    const payload = { success: true, users: enriched };
    if (req.query.debug === '1') {
      payload.debugSample = enriched[0] || null;
      payload.count = enriched.length;
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Delete a user (protected)
router.delete('/users/:id', async (req, res) => {
  const aid = getAdminId(req);
  if (!aid) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, message: 'User id required' });
  try {
    // Basic deletion: user + profile. (Projects/posts cleanup could be added later.)
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    await Promise.all([
      User.deleteOne({ _id: id }),
      UserProfile.deleteOne({ userId: id }).catch(()=>{})
    ]);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Dashboard stats
router.get('/stats', async (req, res) => {
  const aid = getAdminId(req);
  if (!aid) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
    const [totalUsers, totalProjects, totalPosts] = await Promise.all([
      User.countDocuments(),
      Project.countDocuments(),
      CommunityPost.countDocuments()
    ]);

    // Determine most used language from projects
    const langAgg = await Project.aggregate([
      { $group: { _id: '$language', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    const topLanguage = langAgg[0]?._id || null;

    res.json({ success: true, stats: { totalUsers, totalProjects, totalPosts, topLanguage } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Single user dashboard data
router.get('/users/:id/summary', async (req, res) => {
  const aid = getAdminId(req);
  if (!aid) return res.status(401).json({ success:false, message:'Unauthorized'});
  const { id } = req.params;
  try {
    const user = await User.findById(id, 'username email lastLogin date password');
    if (!user) return res.status(404).json({ success:false, message:'User not found'});
    const profile = await UserProfile.findOne({ userId: id }, 'profilePicture bio');
    const userIdStr = String(user._id);
    const [projectCount, languageAgg, projectsBasic, posts, friendReqs, allPostsAgg] = await Promise.all([
      Project.countDocuments({ createdBy: userIdStr }),
      Project.aggregate([
        { $match: { createdBy: userIdStr }},
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Project.find({ createdBy: userIdStr }).sort({ createdAt: -1 }).limit(12).select('_id title language createdAt date'),
      CommunityPost.find({ author: id }).sort({ createdAt: -1 }).limit(6).select('_id content createdAt likes comments'),
      FriendRequest.find({ $or: [{ from: id }, { to: id }], status: 'accepted' }).populate('from to', 'username email')
      , CommunityPost.aggregate([
        { $match: { author: user._id } },
        { $project: { commentsSize: { $size: { $ifNull: ['$comments', []] } } } },
        { $group: { _id: null, totalPosts: { $sum: 1 }, totalComments: { $sum: '$commentsSize' } } }
      ])
    ]);

    // Derive friends unique list
    const friendMap = new Map();
    friendReqs.forEach(fr => {
      const friendUser = String(fr.from._id) === String(id) ? fr.to : fr.from;
      if (friendUser) friendMap.set(String(friendUser._id), { _id: friendUser._id, username: friendUser.username, email: friendUser.email });
    });
    let friends = Array.from(friendMap.values());

    // Attach profilePicture to friends if available
    try {
      if (friends.length > 0) {
        const friendIds = friends.map(f => f._id);
        const friendProfiles = await UserProfile.find({ userId: { $in: friendIds } }, 'userId profilePicture');
        const avatarMap = new Map();
        friendProfiles.forEach(p => avatarMap.set(String(p.userId), p.profilePicture));
        friends = friends.map(f => ({ ...f, profilePicture: avatarMap.get(String(f._id)) || null }));
      }
    } catch (err) {
      // Non-fatal: continue without avatars
      console.warn('Failed to attach friend avatars', err && err.message);
    }

  const totalPosts = allPostsAgg[0]?.totalPosts || posts.length;
  const totalComments = allPostsAgg[0]?.totalComments || 0;

  res.json({ success:true, user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      passwordHash: user.password, // only hashed version is stored
      lastLogin: user.lastLogin,
      joined: user.date,
      profilePicture: profile?.profilePicture || null,
      bio: profile?.bio || ''
    }, stats: {
      projectCount,
  postsCount: totalPosts,
  commentsCount: totalComments, // total comments across all posts
      friendsCount: friends.length,
      topLanguages: languageAgg.map(l => ({ language: l._id, count: l.count }))
    }, projects: projectsBasic, posts: posts.map(p => ({
      _id: p._id,
      content: p.content,
      createdAt: p.createdAt,
  likesCount: p.likes?.length || 0,
  commentsCount: p.comments?.length || 0
    })), friends });
  } catch (err) {
    res.status(500).json({ success:false, message:'Server error', error: err.message });
  }
});
 
// Single project detail (includes code) for admin view
router.get('/projects/:projectId', async (req, res) => {
  const aid = getAdminId(req);
  if (!aid) return res.status(401).json({ success:false, message:'Unauthorized'});
  const { projectId } = req.params;
  try {
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ success:false, message:'Project not found' });
    res.json({ success:true, project });
  } catch (err) {
    res.status(500).json({ success:false, message:'Server error', error: err.message });
  }
});

// Admin Logout
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to logout', error: err.message });
      res.clearCookie('connect.sid');
      return res.json({ success: true, message: 'Logged out successfully' });
    });
  } else {
    res.json({ success: true, message: 'Logged out' });
  }
});

// Route to fetch basic user info for an array of userIds
router.post('/basic-profiles', async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.json({ success: true, profiles: [] });
    }
    const profiles = await UserProfile.find({ userId: { $in: userIds } }, 'userId username profilePicture');
    const map = profiles.map(p => ({ userId: String(p.userId), username: p.username, profilePicture: p.profilePicture || null }));
    res.json({ success: true, profiles: map });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
module.exports = router;
