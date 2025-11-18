const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/userModel');
const UserProfile = require('../models/userProfileModel');

// Serialize/deserialize minimal user id
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user || null);
  } catch (e) { done(e); }
});

// Google
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `${process.env.BACKEND_URL || 'http://localhost:3001'}/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails && profile.emails[0] && profile.emails[0].value;
      const providerId = profile.id;
      const avatar = profile.photos && profile.photos[0] && profile.photos[0].value;
      let user = await User.findOne({ provider: 'google', providerId });
      if (!user && email) user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          name: profile.displayName || 'Google User',
          username: (profile.username || email || (`google_${providerId}`)).split('@')[0],
          email: email || undefined,
          provider: 'google',
          providerId,
          avatar
        });
      } else {
        // update provider linkage if needed
        if (!user.provider || !user.providerId) {
          user.provider = 'google';
          user.providerId = providerId;
        }
        if (avatar && !user.avatar) user.avatar = avatar;
        await user.save();
      }
      // Ensure UserProfile carries default avatar
      try {
        let prof = await UserProfile.findOne({ userId: user._id });
        if (!prof) {
          prof = await UserProfile.create({
            userId: user._id,
            username: user.username || user.name || 'User',
            profilePicture: user.avatar || undefined,
            joinDate: user.date || Date.now()
          });
        } else if (!prof.profilePicture && user.avatar) {
          prof.profilePicture = user.avatar;
          await prof.save();
        }
      } catch (_) {}
      done(null, user);
    } catch (e) { done(e); }
  }));
}

// GitHub
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || `${process.env.BACKEND_URL || 'http://localhost:3001'}/auth/github/callback`,
    scope: ['user:email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // GitHub may not always supply email; try profile.emails
      const email = profile.emails && profile.emails[0] && profile.emails[0].value;
      const providerId = profile.id;
      const avatar = profile.photos && profile.photos[0] && profile.photos[0].value;
      let user = await User.findOne({ provider: 'github', providerId });
      if (!user && email) user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          name: profile.displayName || profile.username || 'GitHub User',
          username: profile.username || (email ? email.split('@')[0] : `github_${providerId}`),
          email: email || undefined,
          provider: 'github',
          providerId,
          avatar
        });
      } else {
        if (!user.provider || !user.providerId) {
          user.provider = 'github';
          user.providerId = providerId;
        }
        if (avatar && !user.avatar) user.avatar = avatar;
        await user.save();
      }
      // Ensure UserProfile carries default avatar
      try {
        let prof = await UserProfile.findOne({ userId: user._id });
        if (!prof) {
          prof = await UserProfile.create({
            userId: user._id,
            username: user.username || user.name || 'User',
            profilePicture: user.avatar || undefined,
            joinDate: user.date || Date.now()
          });
        } else if (!prof.profilePicture && user.avatar) {
          prof.profilePicture = user.avatar;
          await prof.save();
        }
      } catch (_) {}
      done(null, user);
    } catch (e) { done(e); }
  }));
}

module.exports = passport;