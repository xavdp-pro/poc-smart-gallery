import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', 'database.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

let db;

// Initialize database
const SQL = await initSqlJs();

if (existsSync(dbPath)) {
  const buffer = readFileSync(dbPath);
  db = new SQL.Database(buffer);
} else {
  db = new SQL.Database();
}

// Save database to file
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
}

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS photo_tags (
    photo_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (photo_id, tag_id),
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )
`);

db.run('CREATE INDEX IF NOT EXISTS idx_photo_tags_photo ON photo_tags(photo_id)');
db.run('CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags(tag_id)');

// Create photo metadata table for AI analysis
db.run(`
  CREATE TABLE IF NOT EXISTS photo_metadata (
    photo_id INTEGER PRIMARY KEY,
    description TEXT,
    atmosphere TEXT,
    dominant_colors TEXT,
    quality_score INTEGER,
    quality_sharpness TEXT,
    quality_lighting TEXT,
    quality_composition TEXT,
    quality_overall TEXT,
    ai_model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
  )
`);

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create password reset tokens table
db.run(`
  CREATE TABLE IF NOT EXISTS reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.run('CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON reset_tokens(token)');
db.run('CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON reset_tokens(user_id)');

// Create settings table
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Provider IA par défaut : OpenRouter gratuit (ou Ollama si pas de clé)
db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_provider', 'openrouter')`);
db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('enabled_providers', '{"ollama":true,"openrouter":true,"openai":false,"grok":false}')`);

saveDatabase();

// Helper function to run queries
export function runQuery(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

function getQuery(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

function getAllQuery(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Photo operations
export function createPhoto(filename, originalName, path, mimeType, size) {
  const stmt = db.prepare('INSERT INTO photos (filename, original_name, path, mime_type, size) VALUES (?, ?, ?, ?, ?)');
  stmt.bind([filename, originalName, path, mimeType, size]);
  stmt.step();
  stmt.free();
  saveDatabase();

  // Récupérer le dernier ID inséré
  const result = getQuery('SELECT MAX(id) as id FROM photos');
  return result;
}

export function getAllPhotos() {
  const photos = getAllQuery('SELECT * FROM photos ORDER BY created_at DESC');
  
  // Ajouter les métadonnées pour chaque photo
  return photos.map(photo => {
    const metadata = getPhotoMetadata(photo.id);
    return {
      ...photo,
      metadata: metadata
    };
  });
}

export function getPhotoById(id) {
  const photo = getQuery('SELECT * FROM photos WHERE id = ?', [id]);
  if (photo) {
    const metadata = getPhotoMetadata(id);
    return {
      ...photo,
      metadata: metadata
    };
  }
  return photo;
}

export function deletePhoto(id) {
  // Supprimer d'abord les associations de tags
  runQuery('DELETE FROM photo_tags WHERE photo_id = ?', [id]);
  // Puis supprimer la photo
  runQuery('DELETE FROM photos WHERE id = ?', [id]);
}

// Tag operations
export function createTag(name) {
  runQuery('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name]);
}

export function getTagByName(name) {
  return getQuery('SELECT * FROM tags WHERE name = ?', [name]);
}

export function getAllTags() {
  return getAllQuery('SELECT * FROM tags ORDER BY name');
}

// Photo-Tag operations
export function addPhotoTag(photoId, tagId) {
  runQuery('INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)', [photoId, tagId]);
}

export function getPhotoTags(photoId) {
  return getAllQuery(
    'SELECT t.* FROM tags t JOIN photo_tags pt ON t.id = pt.tag_id WHERE pt.photo_id = ? ORDER BY t.name',
    [photoId]
  );
}

export function getPhotosByTag(tagId) {
  return getAllQuery(
    'SELECT p.* FROM photos p JOIN photo_tags pt ON p.id = pt.photo_id WHERE pt.tag_id = ? ORDER BY p.created_at DESC',
    [tagId]
  );
}

export function removePhotoTag(photoId, tagId) {
  runQuery('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?', [photoId, tagId]);
}

// Photo metadata operations
export function savePhotoMetadata(photoId, metadata) {
  const colorsJson = JSON.stringify(metadata.colors || []);
  const quality = metadata.quality || {};
  
  runQuery(
    `INSERT OR REPLACE INTO photo_metadata 
    (photo_id, description, atmosphere, dominant_colors, quality_score, quality_sharpness, quality_lighting, quality_composition, quality_overall, ai_model) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      photoId,
      metadata.description || '',
      metadata.atmosphere || '',
      colorsJson,
      quality.score || 75,
      quality.sharpness || 'good',
      quality.lighting || 'good',
      quality.composition || 'good',
      quality.overall_rating || 'good',
      metadata.aiModel || 'unknown'
    ]
  );
}

export function getPhotoMetadata(photoId) {
  const result = getQuery('SELECT * FROM photo_metadata WHERE photo_id = ?', [photoId]);
  if (result && result.dominant_colors) {
    try {
      result.dominant_colors = JSON.parse(result.dominant_colors);
    } catch (e) {
      result.dominant_colors = [];
    }
  }
  return result;
}

// User operations
export function createUser(email, password, name, role = 'user') {
  const stmt = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)');
  stmt.bind([email, password, name, role]);
  stmt.step();
  stmt.free();
  saveDatabase();

  const result = getQuery('SELECT MAX(id) as id FROM users');
  return result;
}

export function getUserByEmail(email) {
  return getQuery('SELECT * FROM users WHERE email = ?', [email]);
}

export function getUserById(id) {
  return getQuery('SELECT * FROM users WHERE id = ?', [id]);
}

export function getAllUsers() {
  return getAllQuery('SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC');
}

export function updateUser(id, updates) {
  const fields = [];
  const values = [];

  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  if (updates.password !== undefined) {
    fields.push('password = ?');
    values.push(updates.password);
  }
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.role !== undefined) {
    fields.push('role = ?');
    values.push(updates.role);
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active);
  }

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  }
}

export function deleteUser(id) {
  runQuery('DELETE FROM users WHERE id = ?', [id]);
}

// Reset token operations
export function createResetToken(userId, token, expiresAt) {
  runQuery('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [userId, token, expiresAt]);
}

export function getResetToken(token) {
  return getQuery('SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")', [token]);
}

export function markTokenAsUsed(token) {
  runQuery('UPDATE reset_tokens SET used = 1 WHERE token = ?', [token]);
}

export function deleteExpiredTokens() {
  runQuery('DELETE FROM reset_tokens WHERE expires_at < datetime("now") OR used = 1');
}

// Settings operations
export function getSetting(key) {
  return getQuery('SELECT value FROM settings WHERE key = ?', [key]);
}

export function setSetting(key, value) {
  runQuery('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, value]);
}

export function getAllSettings() {
  return getAllQuery('SELECT * FROM settings');
}

export default db;
