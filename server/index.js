import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  createPhoto,
  getAllPhotos,
  getPhotoById,
  deletePhoto,
  createTag,
  getAllTags,
  getTagByName,
  addPhotoTag,
  getPhotoTags,
  removePhotoTag,
  runQuery,
  getSetting,
  setSetting,
} from './database.js';
import {
  getUserByEmail,
  getUserById,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  createResetToken,
  getResetToken,
  markTokenAsUsed,
  deleteExpiredTokens,
} from './database.js';
import { photoQueue } from './queue.js';
import { generateToken, authMiddleware, adminMiddleware } from './auth.js';
import { sendPasswordResetEmail, sendWelcomeEmail, verifyEmailConfig } from './email.js';
import {
  getAvailableProviders,
  getAllProvidersInfo,
  getDefaultFreeProvider,
  isProviderAllowed,
  isProviderAvailable,
} from './ai-providers-config.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Rendre io accessible globalement pour la queue
global.io = io;

const PORT = 8888;

// Middleware
app.use(cors());
app.use(express.json());

// Verify email configuration on startup
verifyEmailConfig();

// Clean up expired tokens periodically (every hour)
setInterval(() => {
  deleteExpiredTokens();
}, 60 * 60 * 1000);

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Create uploads directory if it doesn't exist
const uploadsDir = join(__dirname, '..', 'uploads');
const distDir = join(__dirname, '..', 'dist');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// In Docker/single-server mode: serve built frontend (SPA)
if (process.env.SERVE_APP === '1' && existsSync(distDir)) {
  app.use(express.static(distDir));
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop();
    cb(null, `photo-${uniqueSuffix}.${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Find user
    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Compte désactivé' });
    }

    // Verify password
    console.log(`🔐 Login attempt for ${email}, hash from DB: ${user.password.substring(0, 20)}...`);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log(`🔐 Password valid: ${isPasswordValid}`);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Generate token
    const token = generateToken(user);

    // Return user data (without password)
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    });

    console.log(`✅ User logged in: ${user.email}`);
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    const user = getUserByEmail(email);
    if (!user) {
      // Don't reveal if user exists or not
      return res.json({ message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token to database
    createResetToken(user.id, resetToken, expiresAt.toISOString());

    // Send email
    await sendPasswordResetEmail(user.email, resetToken, user.name);

    res.json({ message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' });

    console.log(`📧 Password reset email sent to: ${user.email}`);
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
  }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token et mot de passe requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Verify token
    const resetToken = getResetToken(token);
    if (!resetToken) {
      return res.status(400).json({ error: 'Token invalide ou expiré' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    updateUser(resetToken.user_id, { password: hashedPassword });

    // Mark token as used
    markTokenAsUsed(token);

    res.json({ message: 'Mot de passe réinitialisé avec succès' });

    console.log(`🔒 Password reset for user ID: ${resetToken.user_id}`);
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation du mot de passe' });
  }
});

// ============================================================================

// Get all users (admin only)
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

// Create user (admin only)
app.post('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email, name, role, password } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Email et nom requis' });
    }

    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
    }

    let temporaryPassword = null;
    let hashedPassword;

    // Use provided password or generate a temporary one
    if (password) {
      // Use the password provided by admin
      if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
      }
      hashedPassword = await bcrypt.hash(password, 10);
    } else {
      // Generate temporary password
      temporaryPassword = crypto.randomBytes(8).toString('hex');
      hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    }

    // Create user
    const result = createUser(email, hashedPassword, name, role || 'user');

    // Send welcome email with temporary password only if auto-generated
    if (temporaryPassword) {
      await sendWelcomeEmail(email, temporaryPassword, name);
    }

    const user = getUserById(result.id);

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
    });

    console.log(`✅ User created: ${email} by admin: ${req.user.email}${password ? ' (custom password)' : ' (auto-generated password)'}`);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
});

// Update user (admin only)
app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { email, name, role, is_active, password } = req.body;

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const updates = {};
    if (email !== undefined) updates.email = email;
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (password) {
      // Validate password strength
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{10,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          error: 'Le mot de passe doit contenir au moins 10 caractères, 1 majuscule, 1 minuscule, 1 chiffre et 1 symbole'
        });
      }
      console.log(`🔐 Changing password for user ${userId}, password length: ${password.length}`);
      updates.password = await bcrypt.hash(password, 10);
      console.log(`🔐 Password hashed successfully`);
    }

    updateUser(userId, updates);

    const updatedUser = getUserById(userId);

    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      is_active: updatedUser.is_active,
      created_at: updatedUser.created_at,
      available_models: {
        openai: !!process.env.OPENAI_API_KEY,
        grok: !!process.env.GROK_API_KEY,
        ollama: !!process.env.OLLAMA_URL,
        openrouter: !!process.env.OPENROUTER_API_KEY
      }
    });

    console.log(`✅ User updated: ${updatedUser.email} by admin: ${req.user.email}`);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'utilisateur' });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Prevent deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    deleteUser(userId);

    res.json({ message: 'Utilisateur supprimé avec succès' });

    console.log(`🗑️ User deleted: ${user.email} by admin: ${req.user.email}`);
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'utilisateur' });
  }
});

// Test email sending (admin only)
app.post('/api/admin/test-email', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email, message } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email destinataire requis' });
    }

    // Import sendTestEmail
    const { sendTestEmail } = await import('./email.js');

    const result = await sendTestEmail(email, message || '');

    res.json({
      success: true,
      messageId: result.messageId,
      message: 'Email de test envoyé avec succès'
    });

    console.log(`📧 Test email sent to: ${email} by admin: ${req.user.email}`);
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'envoi de l\'email de test',
      details: error.message
    });
  }
});

// Get AI settings (tous les utilisateurs authentifiés peuvent voir, seuls les admins peuvent modifier)
app.get('/api/admin/ai-settings', authMiddleware, async (req, res) => {
  try {
    const providerSetting = getSetting('ai_provider');
    let provider = providerSetting?.value || getDefaultFreeProvider();
    if (!isProviderAllowed(provider)) {
      provider = getDefaultFreeProvider();
    }

    const enabledProvidersSetting = getSetting('enabled_providers');
    let enabledProviders = {};

    if (enabledProvidersSetting?.value) {
      try {
        enabledProviders = JSON.parse(enabledProvidersSetting.value);
      } catch (e) {
        console.error('Error parsing enabled_providers:', e);
      }
    }

    const availableWithKeys = getAvailableProviders();
    const freeDefaults = Object.fromEntries(
      getAllProvidersInfo().map((p) => [p.id, availableWithKeys[p.id] === true])
    );
    let availableModels = Object.keys(enabledProviders).length > 0 ? enabledProviders : freeDefaults;
    // Mode gratuit : ignorer openai/grok même si encore en base
    for (const id of Object.keys(availableModels)) {
      if (!isProviderAllowed(id)) availableModels[id] = false;
    }

    const providersInfo = getAllProvidersInfo().map((p) => ({
      ...p,
      available: availableModels[p.id] === true && availableWithKeys[p.id] === true,
    }));

    res.json({
      provider,
      availableModels,
      providersInfo
    });
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des paramètres IA' });
  }
});

// Save AI settings (admin only)
app.post('/api/admin/ai-settings', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { provider, availableModels } = req.body;

    if (!provider || !isProviderAllowed(provider) || !isProviderAvailable(provider)) {
      return res.status(400).json({ error: 'Provider invalide ou non gratuit' });
    }

    if (availableModels) {
      for (const id of Object.keys(availableModels)) {
        if (!isProviderAllowed(id)) availableModels[id] = false;
      }
    }

    // Sauvegarder le provider actif
    setSetting('ai_provider', provider);
    console.log(`AI provider changed to: ${provider.toUpperCase()}`);

    // Sauvegarder les providers activés (cochés dans l'admin)
    if (availableModels) {
      setSetting('enabled_providers', JSON.stringify(availableModels));
      const enabledList = Object.keys(availableModels).filter(k => availableModels[k]);
      console.log(`Enabled providers: ${enabledList.join(', ')}`);
    }

    res.json({ message: 'Paramètres IA sauvegardés avec succès', provider });
  } catch (error) {
    console.error('Error saving AI settings:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde des paramètres IA' });
  }
});

// ============================================================================
// PHOTO ROUTES (Now protected by authentication)
// ============================================================================

// Get all photos
app.get('/api/photos', authMiddleware, (req, res) => {
  try {
    const photos = getAllPhotos();
    res.json(photos);
  } catch (error) {
    console.error('Error fetching photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// Get single photo with tags
app.get('/api/photos/:id', authMiddleware, (req, res) => {
  try {
    const photo = getPhotoById(req.params.id);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    const tags = getPhotoTags(photo.id);
    res.json({ ...photo, tags });
  } catch (error) {
    console.error('Error fetching photo:', error);
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

// Upload photo
app.post('/api/photos/upload', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Décoder le nom de fichier UTF-8 (multer encode en latin1)
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // Save photo to database
    const result = createPhoto(
      req.file.filename,
      originalName,
      `/uploads/${req.file.filename}`,
      req.file.mimetype,
      req.file.size
    );

    const photoId = result.id;

    // Ajouter le job à la queue pour traitement asynchrone
    const imagePath = join(uploadsDir, req.file.filename);
    const socketId = req.body.socketId || req.headers['x-socket-id'];
    const language = req.body.language || 'fr';

    // Ajouter à la queue
    const job = await photoQueue.add({
      photoId,
      imagePath,
      socketId,
      language
    });

    // Retourner immédiatement la photo sans tags
    const photo = getPhotoById(photoId);
    res.json({
      ...photo,
      tags: [],
      jobId: job.id,
      processing: true,
      message: 'Photo uploadée, analyse en cours...'
    });
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// Reanalyze photo with AI
app.post('/api/photos/:id/reanalyze', authMiddleware, async (req, res) => {
  try {
    const photoId = req.params.id;
    const photo = getPhotoById(photoId);

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Construire le chemin de l'image
    const imagePath = join(uploadsDir, photo.filename);

    // Vérifier que le fichier existe
    if (!existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image file not found' });
    }

    const socketId = req.body.socketId || req.headers['x-socket-id'];
    const language = req.body.language || 'fr';

    // Supprimer les anciens tags et métadonnées
    runQuery('DELETE FROM photo_tags WHERE photo_id = ?', [photoId]);
    runQuery('DELETE FROM photo_metadata WHERE photo_id = ?', [photoId]);

    // Ajouter à la queue pour réanalyse
    const job = await photoQueue.add({
      photoId,
      imagePath,
      socketId,
      language
    });

    console.log(`🔄 Photo reanalysis started: ${photo.original_name} (ID: ${photoId})`);

    res.json({
      ...photo,
      tags: [],
      jobId: job.id,
      processing: true,
      message: 'Réanalyse en cours...'
    });
  } catch (error) {
    console.error('Error reanalyzing photo:', error);
    res.status(500).json({ error: 'Failed to reanalyze photo' });
  }
});

// Rename photo
app.put('/api/photos/:id/rename', authMiddleware, (req, res) => {
  try {
    const photoId = req.params.id;
    const { newName } = req.body;

    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const photo = getPhotoById(photoId);

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Mettre à jour le nom dans la base de données
    runQuery('UPDATE photos SET original_name = ? WHERE id = ?', [newName.trim(), photoId]);

    // Récupérer la photo mise à jour
    const updatedPhoto = getPhotoById(photoId);

    console.log(`📝 Photo renamed: ${photo.original_name} → ${newName.trim()}`);

    res.json(updatedPhoto);
  } catch (error) {
    console.error('Error renaming photo:', error);
    res.status(500).json({ error: 'Failed to rename photo' });
  }
});

// Delete photo
app.delete('/api/photos/:id', authMiddleware, (req, res) => {
  try {
    const photoId = req.params.id;

    // Récupérer les infos de la photo avant suppression
    const photo = getPhotoById(photoId);

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Supprimer le fichier physique
    const filePath = join(uploadsDir, photo.filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      console.log(`🗑️ Deleted file: ${photo.filename}`);
    }

    // Supprimer de la base de données (+ tags associés)
    deletePhoto(photoId);

    res.json({ success: true, message: 'Photo and associated tags deleted' });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// Get all tags
app.get('/api/tags', authMiddleware, (req, res) => {
  try {
    const tags = getAllTags();
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Get photo tags
app.get('/api/photos/:id/tags', authMiddleware, (req, res) => {
  try {
    const tags = getPhotoTags(req.params.id);
    res.json(tags);
  } catch (error) {
    console.error('Error fetching photo tags:', error);
    res.status(500).json({ error: 'Failed to fetch photo tags' });
  }
});

// Add tag to photo
app.post('/api/photos/:id/tags', authMiddleware, (req, res) => {
  try {
    const { tagName } = req.body;
    if (!tagName) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    createTag(tagName.toLowerCase());
    const tag = getTagByName(tagName.toLowerCase());
    if (tag) {
      addPhotoTag(req.params.id, tag.id);
    }

    const tags = getPhotoTags(req.params.id);
    res.json(tags);
  } catch (error) {
    console.error('Error adding tag:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// Remove tag from photo
app.delete('/api/photos/:photoId/tags/:tagId', authMiddleware, (req, res) => {
  try {
    removePhotoTag(req.params.photoId, req.params.tagId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// SPA fallback (must be after all API routes)
if (process.env.SERVE_APP === '1' && existsSync(distDir)) {
  app.get('*', (req, res) => res.sendFile(join(distDir, 'index.html')));
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📸 Photo Manager API ready!`);
  console.log(`🔌 WebSocket ready for real-time updates`);
  if (process.env.SERVE_APP === '1') console.log(`📂 Serving app from dist`);
});
