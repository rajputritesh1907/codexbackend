const mongoose = require('mongoose');
const dns = require('dns');

// Optionally force IPv4 first to avoid IPv6/NAT64 issues with some networks/ISPs
// Enable with MONGODB_IPV4_FIRST=true (default true in dev)
if (String(process.env.MONGODB_IPV4_FIRST || 'true').toLowerCase() === 'true') {
    try {
        if (typeof dns.setDefaultResultOrder === 'function') {
            dns.setDefaultResultOrder('ipv4first');
            console.log('[DB] DNS result order set to ipv4first');
        }
    } catch (e) {
        console.warn('[DB] Unable to set DNS result order:', e.message);
    }
}

// Database configuration
const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fullstack_ide';
    const maxAttempts = Number(process.env.MONGODB_CONNECT_ATTEMPTS || 3);
    const baseDelay = Number(process.env.MONGODB_RETRY_DELAY_MS || 1000);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await mongoose.connect(mongoURI, {
                // Give Atlas a bit more time to select a primary
                serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS || 10000),
                // StrictQuery recommended in recent mongoose
                // family option is not supported by the driver; we control via dns above
            });

            console.log('MongoDB connected successfully');

            // Handle connection events
            mongoose.connection.on('connected', () => {
                console.log('Mongoose connected to MongoDB');
            });

            mongoose.connection.on('error', (err) => {
                console.error('Mongoose connection error:', err);
            });

            mongoose.connection.on('disconnected', () => {
                console.log('Mongoose disconnected from MongoDB');
            });

            return; // success
        } catch (error) {
            console.error(`[DB] Attempt ${attempt}/${maxAttempts} failed:`, error.message);
            if (attempt < maxAttempts) {
                const delay = baseDelay * attempt;
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            // Don't exit process, let the app run without database
            console.error('[DB] MongoDB connection failed after retries. Application will continue without database connection');
        }
    }
};

module.exports = connectDB;
