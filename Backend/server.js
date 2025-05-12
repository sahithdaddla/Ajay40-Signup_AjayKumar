
const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');

dotenv.config();

const app = express();

// CORS middleware with specific origins
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000', // Login page
    
    'http://localhost:5500', // Forgot password page
    'http://127.0.0.1:5500' // Forgot password page (alternative IP)
  ]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'auth_db',
  password: process.env.DB_PASSWORD || 'password@12345',
  port: process.env.DB_PORT || 5432,
});

// Multer configuration for image upload
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Initialize database (create users table if it doesn't exist)
async function initializeDatabase() {
  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    const tableExists = tableCheck.rows[0].exists;

    if (!tableExists) {
      console.log('Creating users table...');
      await pool.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password TEXT NOT NULL,
          profile_image TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_email ON users(email);
      `);
      console.log('Users table created successfully.');
    } else {
      console.log('Users table already exists.');
    }
  } catch (err) {
    console.error('Error initializing database:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    process.exit(1);
  }
}

// Test database connection and initialize database
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    process.exit(1);
    return;
  }
  console.log('Connected to PostgreSQL database');
  release();
  initializeDatabase();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'Database connection OK' });
  } catch (err) {
    console.error('Health check error:', {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

// Serve HTML pages
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));

// Login - Endpoint: http://localhost:3000/login-data
app.post('/login-data', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let result;
    try {
      result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    } catch (err) {
      if (err.code === '42P01') {
        console.error('Table "users" does not exist');
        return res.status(500).json({ error: 'Table "users" does not exist. Please initialize the database.' });
      }
      throw err;
    }

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    res.json({ message: 'Login successful' });
  } catch (err) {
    console.error('Error in POST /login-data:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Signup - Endpoint: http://localhost:3000/signup-data
app.post('/signup-data', upload.single('profileImage'), async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    const profileImage = req.file ? `/uploads/${req.file.filename}` : null;

    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let result;
    try {
      result = await pool.query(
        'INSERT INTO users (username, email, password, profile_image) VALUES ($1, $2, $3, $4) RETURNING *',
        [username, email, hashedPassword, profileImage]
      );
    } catch (err) {
      if (err.code === '42P01') {
        console.error('Table "users" does not exist');
        return res.status(500).json({ error: 'Table "users" does not exist. Please initialize the database.' });
      }
      throw err;
    }

    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('Error in POST /signup-data:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    if (err.code === '23505') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: err.message || 'Server error' });
    }
  }
});

// Check email - Endpoint: http://localhost:3000/check-email-data
app.post('/check-email-data', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let result;
    try {
      result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    } catch (err) {
      if (err.code === '42P01') {
        console.error('Table "users" does not exist');
        return res.status(500).json({ error: 'Table "users" does not exist. Please initialize the database.' });
      }
      throw err;
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ exists: false, message: 'Email not found' });
    }

    res.json({ exists: true, message: 'Email found' });
  } catch (err) {
    console.error('Error in POST /check-email-data:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Reset password - Endpoint: http://localhost:3000/reset-password-data
app.post('/reset-password-data', async (req, res) => {
  try {
    const { email, newPassword, confirmNewPassword } = req.body;

    if (!email || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    let result;
    try {
      result = await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
    } catch (err) {
      if (err.code === '42P01') {
        console.error('Table "users" does not exist');
        return res.status(500).json({ error: 'Table "users" does not exist. Please initialize the database.' });
      }
      throw err;
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Error in POST /reset-password-data:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


