CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folder_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    folder_path VARCHAR(500) NOT NULL,
    UNIQUE(user_id, folder_path)
);

CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, file_path)
);

CREATE TABLE IF NOT EXISTS deleted_files (
    id SERIAL PRIMARY KEY,
    original_path VARCHAR(500) NOT NULL,
    trash_path VARCHAR(500) NOT NULL,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP DEFAULT NOW(),
    purge_after TIMESTAMP NOT NULL,
    file_size BIGINT DEFAULT 0,
    file_name VARCHAR(255) NOT NULL
);
