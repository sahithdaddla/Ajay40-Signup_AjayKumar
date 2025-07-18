-- Drop existing users table (if needed for a fresh start)
DROP TABLE IF EXISTS users;

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    profile_image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index to speed up lookups by email
CREATE INDEX idx_email ON users(email);

-- Optional: Insert a demo user (make sure the password is hashed using bcrypt before inserting)
-- Replace <HASHED_PASSWORD> with actual hashed password
-- INSERT INTO users (username, email, password)
-- VALUES ('testuser', 'test@example.com', '<HASHED_PASSWORD>');

