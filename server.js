const express = require('express');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 3000;

// ═══════════════════════════════════════════════════════
//  DIRECTORIES
// ═══════════════════════════════════════════════════════
['uploads', 'data', 'data/boards'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ═══════════════════════════════════════════════════════
//  USER DATABASE (JSON file-based)
// ═══════════════════════════════════════════════════════
const USERS_FILE = path.join(__dirname, 'data', '_users.json');
const SETTINGS_FILE = path.join(__dirname, 'data', '_settings.json');

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return { registrationEnabled: true };
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return { registrationEnabled: true }; }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUser(username) {
  return loadUsers().find(u => u.username === username.toLowerCase());
}

function findUserById(id) {
  return loadUsers().find(u => u.id === id);
}

// Create default admin if no users exist
function ensureDefaultAdmin() {
  const users = loadUsers();
  if (users.length === 0) {
    const hash = bcrypt.hashSync('admin', 10);
    users.push({
      id: 'user_admin',
      username: 'admin',
      displayName: 'Admin',
      passwordHash: hash,
      role: 'admin',
      created: new Date().toISOString(),
      lastLogin: null,
    });
    saveUsers(users);
    console.log('Default admin created — admin / admin');
  }
}

// Migrate old boards (from data/*.json to data/boards/admin/)
function migrateOldBoards() {
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir).filter(f =>
    f.endsWith('.json') && !f.startsWith('_') && f !== '_users.json' && f !== '_suggestions.json'
  );
  if (files.length === 0) return;

  const adminBoardDir = path.join(__dirname, 'data', 'boards', 'admin');
  if (!fs.existsSync(adminBoardDir)) fs.mkdirSync(adminBoardDir, { recursive: true });

  files.forEach(f => {
    const src = path.join(dataDir, f);
    const dest = path.join(adminBoardDir, f);
    if (!fs.existsSync(dest)) {
      fs.renameSync(src, dest);
      console.log(`Migrated board: ${f} → admin/${f}`);
    } else {
      // Already exists in target, just remove old file
      fs.unlinkSync(src);
    }
  });
}

ensureDefaultAdmin();
migrateOldBoards();

// ═══════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════
app.use(express.json({ limit: '50mb' }));

const sessionMiddleware = session({
  secret: 'wollmilchsau-secret-' + (process.env.SESSION_SECRET || 'dev-2026'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
  },
});
app.use(sessionMiddleware);

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.xhr || req.headers.accept?.includes('json')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (req.xhr || req.headers.accept?.includes('json')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return res.redirect('/login');
}

// Static assets (publicly accessible)
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(__dirname, 'public', 'favicon.svg')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ═══════════════════════════════════════════════════════
//  PAGE ROUTES
// ═══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/canvas', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'canvas.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/settings', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// ═══════════════════════════════════════════════════════
//  AUTH API
// ═══════════════════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = findUser(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' });

  // Update lastLogin
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    users[idx].lastLogin = new Date().toISOString();
    saveUsers(users);
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

// Public config endpoint (no auth required)
app.get('/api/config/public', (req, res) => {
  const { registrationEnabled } = loadSettings();
  res.json({ registrationEnabled });
});

app.post('/api/auth/register', (req, res) => {
  const { registrationEnabled } = loadSettings();
  if (!registrationEnabled) return res.status(403).json({ error: 'Registration is currently disabled' });

  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (cleanUsername.length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters' });
  if (password.length < 3) return res.status(400).json({ error: 'Password must be at least 3 characters' });

  if (findUser(cleanUsername)) return res.status(409).json({ error: 'Username already taken' });

  const users = loadUsers();
  const hash = bcrypt.hashSync(password, 10);
  const newUser = {
    id: 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
    username: cleanUsername,
    displayName: displayName || cleanUsername,
    passwordHash: hash,
    role: 'user',
    created: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(users);

  // Create boards directory
  const userBoardDir = path.join(__dirname, 'data', 'boards', cleanUsername);
  if (!fs.existsSync(userBoardDir)) fs.mkdirSync(userBoardDir, { recursive: true });

  // Auto-login
  req.session.user = {
    id: newUser.id,
    username: newUser.username,
    displayName: newUser.displayName,
    role: newUser.role,
  };

  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    const users = loadUsers();
    const user = users.find(u => u.id === req.session.user.id);
    return res.json({ user: {
      ...req.session.user,
      email: user ? (user.email || '') : '',
      llmProvider: user ? (user.llmProvider || '') : '',
      llmModel: user ? (user.llmModel || '') : '',
      llmSystemPrompt: user ? (user.llmSystemPrompt || '') : '',
      llmConfigured: user ? !!(user.llmApiKey) : false,
    }});
  }
  res.status(401).json({ error: 'Not authenticated' });
});

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  const { displayName, email, currentPassword, newPassword, llmProvider, llmApiKey, llmModel, llmSystemPrompt } = req.body;
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === req.session.user.id);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });

  if (displayName !== undefined) {
    const trimmed = displayName.trim();
    if (trimmed) users[idx].displayName = trimmed;
  }
  if (email !== undefined) {
    users[idx].email = email.trim();
  }
  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
    const valid = await bcrypt.compare(currentPassword, users[idx].passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  }

  if (llmProvider !== undefined) users[idx].llmProvider = llmProvider;
  if (llmModel !== undefined) users[idx].llmModel = llmModel;
  if (llmSystemPrompt !== undefined) users[idx].llmSystemPrompt = llmSystemPrompt;
  if (llmApiKey !== undefined) users[idx].llmApiKey = llmApiKey;

  saveUsers(users);
  req.session.user.displayName = users[idx].displayName;
  res.json({ ok: true, displayName: users[idx].displayName, email: users[idx].email || '' });
});

// ═══════════════════════════════════════════════════════
//  USERS LIST (authenticated — for todo assignment)
// ═══════════════════════════════════════════════════════
app.get('/api/users', requireAuth, (req, res) => {
  const users = loadUsers().map(u => ({
    username: u.username,
    displayName: u.displayName,
  }));
  res.json(users);
});

// ═══════════════════════════════════════════════════════
//  FILE UPLOAD (authenticated)
// ═══════════════════════════════════════════════════════
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    url: '/uploads/' + req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// ═══════════════════════════════════════════════════════
//  BOARD API (user-scoped)
// ═══════════════════════════════════════════════════════
function getUserBoardDir(username) {
  const dir = path.join(__dirname, 'data', 'boards', username);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Save board
app.post('/api/boards/:name', requireAuth, (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const boardDir = getUserBoardDir(req.session.user.username);
  const filePath = path.join(boardDir, name + '.json');

  let created = new Date().toISOString();
  let collaborators = [];
  let shareToken = undefined;
  let sharePasswordHash = undefined;
  if (fs.existsSync(filePath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (prev.meta && prev.meta.created) created = prev.meta.created;
      if (prev.meta && prev.meta.collaborators) collaborators = prev.meta.collaborators;
      if (prev.meta && prev.meta.shareToken) shareToken = prev.meta.shareToken;
      if (prev.meta && prev.meta.sharePasswordHash) sharePasswordHash = prev.meta.sharePasswordHash;
    } catch (e) {}
  }

  const meta = {
    created,
    lastEdit: new Date().toISOString(),
    elementCount: (req.body.elements || []).length,
    owner: req.session.user.username,
    collaborators,
  };
  if (shareToken) meta.shareToken = shareToken;
  if (sharePasswordHash) meta.sharePasswordHash = sharePasswordHash;

  const data = {
    ...req.body,
    meta,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// Rename board
app.post('/api/boards/:name/rename', requireAuth, (req, res) => {
  const oldName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const newName = (req.body.newName || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!newName) return res.status(400).json({ error: 'Invalid name' });

  const boardDir = getUserBoardDir(req.session.user.username);
  const oldPath = path.join(boardDir, oldName + '.json');
  const newPath = path.join(boardDir, newName + '.json');

  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Board not found' });
  if (fs.existsSync(newPath)) return res.status(409).json({ error: 'Name already exists' });

  fs.renameSync(oldPath, newPath);
  res.json({ success: true, newName });
});

// Load board
app.get('/api/boards/:name', requireAuth, (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const boardDir = getUserBoardDir(req.session.user.username);
  const filePath = path.join(boardDir, name + '.json');

  if (!fs.existsSync(filePath)) return res.json({ elements: [], connections: [] });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json(data);
});

// Delete board
app.delete('/api/boards/:name', requireAuth, (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const boardDir = getUserBoardDir(req.session.user.username);
  const filePath = path.join(boardDir, name + '.json');

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Board not found' });
  }
});

// List boards (own + shared)
app.get('/api/boards', requireAuth, (req, res) => {
  const username = req.session.user.username;
  const boardDir = getUserBoardDir(username);
  const files = fs.readdirSync(boardDir).filter(f => f.endsWith('.json'));
  const boards = files.map(f => {
    const name = f.replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(boardDir, f), 'utf8'));
      return {
        name,
        owner: username,
        shared: false,
        created: data.meta?.created || null,
        lastEdit: data.meta?.lastEdit || null,
        elementCount: data.meta?.elementCount || (data.elements || []).length,
      };
    } catch (e) {
      return { name, owner: username, shared: false, created: null, lastEdit: null, elementCount: 0 };
    }
  });

  // Find shared boards from other users
  const boardsBase = path.join(__dirname, 'data', 'boards');
  if (fs.existsSync(boardsBase)) {
    fs.readdirSync(boardsBase).filter(d => d !== username && fs.statSync(path.join(boardsBase, d)).isDirectory()).forEach(owner => {
      const ownerDir = path.join(boardsBase, owner);
      fs.readdirSync(ownerDir).filter(f => f.endsWith('.json')).forEach(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(ownerDir, f), 'utf8'));
          const collabs = data.meta?.collaborators || [];
          if (collabs.includes(username)) {
            boards.push({
              name: f.replace('.json', ''),
              owner,
              shared: true,
              created: data.meta?.created || null,
              lastEdit: data.meta?.lastEdit || null,
              elementCount: data.meta?.elementCount || (data.elements || []).length,
            });
          }
        } catch (e) {}
      });
    });
  }

  boards.sort((a, b) => (b.lastEdit || '').localeCompare(a.lastEdit || ''));
  res.json(boards);
});

// Board thumbnail (own)
app.get('/api/boards/:name/thumb', requireAuth, (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(getUserBoardDir(req.session.user.username), name + '.json');
  if (!fs.existsSync(filePath)) return res.status(404).end();
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.thumbnail) return res.status(404).end();
    const base64 = data.thumbnail.replace(/^data:image\/\w+;base64,/, '');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=60');
    res.send(Buffer.from(base64, 'base64'));
  } catch (e) { res.status(500).end(); }
});

// ═══════════════════════════════════════════════════════
//  BOARD SHARING — must be before /:owner/:name routes
// ═══════════════════════════════════════════════════════

// Get share status for own board
app.get('/api/boards/:name/share', requireAuth, (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(getUserBoardDir(req.session.user.username), name + '.json');
  if (!fs.existsSync(filePath)) return res.json({ enabled: false, shareToken: null, hasPassword: false });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json({
    enabled: !!data.meta?.shareToken,
    shareToken: data.meta?.shareToken || null,
    hasPassword: !!data.meta?.sharePasswordHash,
  });
});

// Enable/update sharing
app.post('/api/boards/:name/share', requireAuth, (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(getUserBoardDir(req.session.user.username), name + '.json');
  const { password } = req.body;
  const data = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : { elements: [], connections: [], meta: { created: new Date().toISOString(), owner: req.session.user.username, collaborators: [] } };
  if (!data.meta) data.meta = {};
  if (!data.meta.shareToken) data.meta.shareToken = crypto.randomBytes(24).toString('hex');
  if (password === null || password === '') {
    delete data.meta.sharePasswordHash;
  } else if (typeof password === 'string') {
    data.meta.sharePasswordHash = bcrypt.hashSync(password, 10);
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true, shareToken: data.meta.shareToken, hasPassword: !!data.meta.sharePasswordHash });
});

// Disable sharing
app.delete('/api/boards/:name/share', requireAuth, (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(getUserBoardDir(req.session.user.username), name + '.json');
  if (!fs.existsSync(filePath)) return res.json({ success: true });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (data.meta) { delete data.meta.shareToken; delete data.meta.sharePasswordHash; }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// Board thumbnail (shared)
app.get('/api/boards/:owner/:name/thumb', requireAuth, (req, res) => {
  const owner = req.params.owner.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const username = req.session.user.username;

  const boardPath = owner === username
    ? path.join(getUserBoardDir(username), name + '.json')
    : path.join(__dirname, 'data', 'boards', owner, name + '.json');

  if (!fs.existsSync(boardPath)) return res.status(404).end();
  try {
    const data = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
    if (owner !== username) {
      const collabs = data.meta?.collaborators || [];
      if (!collabs.includes(username) && req.session.user.role !== 'admin') return res.status(403).end();
    }
    if (!data.thumbnail) return res.status(404).end();
    const base64 = data.thumbnail.replace(/^data:image\/\w+;base64,/, '');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=60');
    res.send(Buffer.from(base64, 'base64'));
  } catch (e) { res.status(500).end(); }
});

// Load shared board
app.get('/api/boards/:owner/:name', requireAuth, (req, res) => {
  const owner = req.params.owner.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const username = req.session.user.username;

  // If loading own board, redirect to standard route logic
  if (owner === username) {
    const boardDir = getUserBoardDir(username);
    const filePath = path.join(boardDir, name + '.json');
    if (!fs.existsSync(filePath)) return res.json({ elements: [], connections: [] });
    return res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  }

  const filePath = path.join(__dirname, 'data', 'boards', owner, name + '.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Board not found' });

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const collabs = data.meta?.collaborators || [];
  const isAdmin = req.session.user.role === 'admin';
  if (!collabs.includes(username) && !isAdmin) return res.status(403).json({ error: 'Access denied' });

  res.json(data);
});

// Save shared board
app.post('/api/boards/:owner/:name', requireAuth, (req, res) => {
  const owner = req.params.owner.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const username = req.session.user.username;

  // If saving own board, use standard logic
  if (owner === username) {
    const boardDir = getUserBoardDir(username);
    const filePath = path.join(boardDir, name + '.json');
    let created = new Date().toISOString();
    let collaborators = [];
    if (fs.existsSync(filePath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (prev.meta?.created) created = prev.meta.created;
        if (prev.meta?.collaborators) collaborators = prev.meta.collaborators;
      } catch (e) {}
    }
    const data = { ...req.body, meta: { created, lastEdit: new Date().toISOString(), elementCount: (req.body.elements || []).length, owner: username, collaborators } };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return res.json({ success: true });
  }

  const filePath = path.join(__dirname, 'data', 'boards', owner, name + '.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Board not found' });

  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const collabs = existing.meta?.collaborators || [];
  const isAdmin = req.session.user.role === 'admin';
  if (!collabs.includes(username) && !isAdmin) return res.status(403).json({ error: 'Access denied' });

  const data = { ...req.body, meta: { created: existing.meta?.created || new Date().toISOString(), lastEdit: new Date().toISOString(), elementCount: (req.body.elements || []).length, owner, collaborators: collabs } };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
//  SUGGESTIONS API (shared, authenticated)
// ═══════════════════════════════════════════════════════
const suggestionsFile = path.join(__dirname, 'data', '_suggestions.json');

app.get('/api/suggestions', requireAuth, (req, res) => {
  if (!fs.existsSync(suggestionsFile)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(suggestionsFile, 'utf8')));
});

app.post('/api/suggestions', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty' });
  let suggestions = [];
  if (fs.existsSync(suggestionsFile)) {
    suggestions = JSON.parse(fs.readFileSync(suggestionsFile, 'utf8'));
  }
  suggestions.unshift({
    text: text.trim(),
    time: new Date().toISOString(),
    user: req.session.user.username,
  });
  fs.writeFileSync(suggestionsFile, JSON.stringify(suggestions, null, 2));
  res.json({ success: true });
});

// Edit suggestion (owner or admin)
app.put('/api/suggestions/:index', requireAuth, (req, res) => {
  const idx = parseInt(req.params.index);
  const { text } = req.body;
  if (isNaN(idx)) return res.status(400).json({ error: 'Invalid index' });
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty' });

  let suggestions = [];
  if (fs.existsSync(suggestionsFile)) {
    suggestions = JSON.parse(fs.readFileSync(suggestionsFile, 'utf8'));
  }
  if (idx < 0 || idx >= suggestions.length) return res.status(404).json({ error: 'Not found' });

  // Only the owner or an admin can edit
  const isOwner = suggestions[idx].user === req.session.user.username;
  const isAdmin = req.session.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not allowed' });

  suggestions[idx].text = text.trim();
  suggestions[idx].edited = new Date().toISOString();
  fs.writeFileSync(suggestionsFile, JSON.stringify(suggestions, null, 2));
  res.json({ success: true });
});

// Delete suggestion (owner or admin)
app.delete('/api/suggestions/:index', requireAuth, (req, res) => {
  const idx = parseInt(req.params.index);
  if (isNaN(idx)) return res.status(400).json({ error: 'Invalid index' });

  let suggestions = [];
  if (fs.existsSync(suggestionsFile)) {
    suggestions = JSON.parse(fs.readFileSync(suggestionsFile, 'utf8'));
  }
  if (idx < 0 || idx >= suggestions.length) return res.status(404).json({ error: 'Not found' });

  const isOwner = suggestions[idx].user === req.session.user.username;
  const isAdmin = req.session.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not allowed' });

  suggestions.splice(idx, 1);
  fs.writeFileSync(suggestionsFile, JSON.stringify(suggestions, null, 2));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
//  EXPORT API
// ═══════════════════════════════════════════════════════
app.post('/api/export', requireAuth, (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'No data' });
  const base64 = data.replace(/^data:image\/png;base64,/, '');
  const filename = 'export-' + Date.now() + '.png';
  fs.writeFileSync(path.join(__dirname, 'uploads', filename), base64, 'base64');
  res.json({ url: '/uploads/' + filename });
});

// ═══════════════════════════════════════════════════════
//  ADMIN API
// ═══════════════════════════════════════════════════════

// Stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const users = loadUsers();
  let totalBoards = 0;
  let totalElements = 0;

  const boardsBaseDir = path.join(__dirname, 'data', 'boards');
  if (fs.existsSync(boardsBaseDir)) {
    const userDirs = fs.readdirSync(boardsBaseDir).filter(d =>
      fs.statSync(path.join(boardsBaseDir, d)).isDirectory()
    );
    userDirs.forEach(userDir => {
      const boardFiles = fs.readdirSync(path.join(boardsBaseDir, userDir)).filter(f => f.endsWith('.json'));
      totalBoards += boardFiles.length;
      boardFiles.forEach(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(boardsBaseDir, userDir, f), 'utf8'));
          totalElements += (data.elements || []).length;
        } catch (e) {}
      });
    });
  }

  let totalSuggestions = 0;
  if (fs.existsSync(suggestionsFile)) {
    try {
      totalSuggestions = JSON.parse(fs.readFileSync(suggestionsFile, 'utf8')).length;
    } catch (e) {}
  }

  // Uploads size
  let uploadsSize = 0;
  const uploadsDir = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    fs.readdirSync(uploadsDir).forEach(f => {
      try {
        uploadsSize += fs.statSync(path.join(uploadsDir, f)).size;
      } catch (e) {}
    });
  }

  res.json({
    totalUsers: users.length,
    totalBoards,
    totalElements,
    totalSuggestions,
    uploadsSize,
  });
});

// List all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = loadUsers().map(u => {
    const boardDir = path.join(__dirname, 'data', 'boards', u.username);
    let boardCount = 0;
    if (fs.existsSync(boardDir)) {
      boardCount = fs.readdirSync(boardDir).filter(f => f.endsWith('.json')).length;
    }
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      created: u.created,
      lastLogin: u.lastLogin,
      boardCount,
    };
  });
  res.json(users);
});

// Create user (admin)
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (cleanUsername.length < 2) return res.status(400).json({ error: 'Username too short' });
  if (findUser(cleanUsername)) return res.status(409).json({ error: 'Username already taken' });

  const users = loadUsers();
  const hash = bcrypt.hashSync(password, 10);
  const newUser = {
    id: 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
    username: cleanUsername,
    displayName: displayName || cleanUsername,
    passwordHash: hash,
    role: role || 'user',
    created: new Date().toISOString(),
    lastLogin: null,
  };
  users.push(newUser);
  saveUsers(users);

  const userBoardDir = path.join(__dirname, 'data', 'boards', cleanUsername);
  if (!fs.existsSync(userBoardDir)) fs.mkdirSync(userBoardDir, { recursive: true });

  res.json({ success: true, user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role } });
});

// Update user (admin)
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });

  const { displayName, role } = req.body;
  if (displayName !== undefined) users[idx].displayName = displayName;
  if (role !== undefined) users[idx].role = role;

  saveUsers(users);
  res.json({ success: true });
});

// Reset password (admin)
app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'Password must be at least 3 characters' });

  const users = loadUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });

  users[idx].passwordHash = bcrypt.hashSync(newPassword, 10);
  saveUsers(users);
  res.json({ success: true });
});

// Delete user (admin)
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });

  // Prevent deleting yourself
  if (req.session.user.id === req.params.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  const username = users[idx].username;
  users.splice(idx, 1);
  saveUsers(users);

  // Optionally remove user's boards directory
  const boardDir = path.join(__dirname, 'data', 'boards', username);
  if (fs.existsSync(boardDir)) {
    fs.rmSync(boardDir, { recursive: true, force: true });
  }

  res.json({ success: true });
});

// List all boards (admin)
app.get('/api/admin/boards', requireAdmin, (req, res) => {
  const boardsBaseDir = path.join(__dirname, 'data', 'boards');
  const allBoards = [];

  if (fs.existsSync(boardsBaseDir)) {
    const userDirs = fs.readdirSync(boardsBaseDir).filter(d =>
      fs.statSync(path.join(boardsBaseDir, d)).isDirectory()
    );
    userDirs.forEach(username => {
      const boardFiles = fs.readdirSync(path.join(boardsBaseDir, username)).filter(f => f.endsWith('.json'));
      boardFiles.forEach(f => {
        const name = f.replace('.json', '');
        try {
          const data = JSON.parse(fs.readFileSync(path.join(boardsBaseDir, username, f), 'utf8'));
          allBoards.push({
            name,
            owner: username,
            created: data.meta?.created || null,
            lastEdit: data.meta?.lastEdit || null,
            elementCount: data.meta?.elementCount || (data.elements || []).length,
          });
        } catch (e) {
          allBoards.push({ name, owner: username, created: null, lastEdit: null, elementCount: 0 });
        }
      });
    });
  }

  allBoards.sort((a, b) => (b.lastEdit || '').localeCompare(a.lastEdit || ''));
  res.json(allBoards);
});

// Delete board (admin)
app.delete('/api/admin/boards/:username/:name', requireAdmin, (req, res) => {
  const username = req.params.username.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(__dirname, 'data', 'boards', username, name + '.json');

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Board not found' });
  }
});

// Board collaborators (admin)
app.get('/api/admin/boards/:username/:name/collaborators', requireAdmin, (req, res) => {
  const username = req.params.username.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(__dirname, 'data', 'boards', username, name + '.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Board not found' });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json(data.meta?.collaborators || []);
});

app.post('/api/admin/boards/:username/:name/collaborators', requireAdmin, (req, res) => {
  const username = req.params.username.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const { user: collab } = req.body;
  if (!collab) return res.status(400).json({ error: 'User required' });

  const filePath = path.join(__dirname, 'data', 'boards', username, name + '.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Board not found' });

  // Verify the user exists
  if (!findUser(collab)) return res.status(404).json({ error: 'User not found' });
  if (collab === username) return res.status(400).json({ error: 'Cannot add owner as collaborator' });

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!data.meta) data.meta = {};
  if (!data.meta.collaborators) data.meta.collaborators = [];
  if (data.meta.collaborators.includes(collab)) return res.status(409).json({ error: 'Already a collaborator' });

  data.meta.collaborators.push(collab);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true, collaborators: data.meta.collaborators });
});

app.delete('/api/admin/boards/:username/:name/collaborators/:user', requireAdmin, (req, res) => {
  const username = req.params.username.replace(/[^a-zA-Z0-9_-]/g, '');
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const collab = req.params.user;

  const filePath = path.join(__dirname, 'data', 'boards', username, name + '.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Board not found' });

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!data.meta?.collaborators) return res.status(404).json({ error: 'Not a collaborator' });

  const idx = data.meta.collaborators.indexOf(collab);
  if (idx < 0) return res.status(404).json({ error: 'Not a collaborator' });

  data.meta.collaborators.splice(idx, 1);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true, collaborators: data.meta.collaborators });
});

// Admin suggestions
app.get('/api/admin/suggestions', requireAdmin, (req, res) => {
  if (!fs.existsSync(suggestionsFile)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(suggestionsFile, 'utf8')));
});

// Toggle suggestion done status (admin)
app.patch('/api/admin/suggestions/:index/toggle-done', requireAdmin, (req, res) => {
  const idx = parseInt(req.params.index);
  if (isNaN(idx)) return res.status(400).json({ error: 'Invalid index' });

  let suggestions = [];
  if (fs.existsSync(suggestionsFile)) {
    suggestions = JSON.parse(fs.readFileSync(suggestionsFile, 'utf8'));
  }
  if (idx < 0 || idx >= suggestions.length) return res.status(404).json({ error: 'Not found' });

  suggestions[idx].done = !suggestions[idx].done;
  if (suggestions[idx].done) {
    suggestions[idx].doneBy = req.session.user.username;
    suggestions[idx].doneAt = new Date().toISOString();
  } else {
    delete suggestions[idx].doneBy;
    delete suggestions[idx].doneAt;
  }

  fs.writeFileSync(suggestionsFile, JSON.stringify(suggestions, null, 2));
  res.json({ success: true, done: suggestions[idx].done });
});

// ═══════════════════════════════════════════════════════
// Admin Settings
// ═══════════════════════════════════════════════════════
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json(loadSettings());
});

app.patch('/api/admin/settings', requireAdmin, (req, res) => {
  const settings = loadSettings();
  if (typeof req.body.registrationEnabled === 'boolean') {
    settings.registrationEnabled = req.body.registrationEnabled;
  }
  saveSettings(settings);
  res.json(settings);
});

app.delete('/api/admin/suggestions/:index', requireAdmin, (req, res) => {
  const idx = parseInt(req.params.index);
  if (isNaN(idx)) return res.status(400).json({ error: 'Invalid index' });

  let suggestions = [];
  if (fs.existsSync(suggestionsFile)) {
    suggestions = JSON.parse(fs.readFileSync(suggestionsFile, 'utf8'));
  }
  if (idx < 0 || idx >= suggestions.length) return res.status(404).json({ error: 'Not found' });

  suggestions.splice(idx, 1);
  fs.writeFileSync(suggestionsFile, JSON.stringify(suggestions, null, 2));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
//  STATISTICS
// ═══════════════════════════════════════════════════════
app.get('/api/stats', requireAuth, (req, res) => {
  const boardDir = path.join(__dirname, 'data', 'boards', req.session.user.username);
  let boards = [];
  if (fs.existsSync(boardDir)) {
    boards = fs.readdirSync(boardDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(boardDir, f), 'utf8'));
          const elements = data.elements || [];
          const typeCounts = {};
          elements.forEach(el => { typeCounts[el.type] = (typeCounts[el.type] || 0) + 1; });
          return {
            name: f.replace('.json', ''),
            elementCount: elements.length,
            connectionCount: (data.connections || []).length,
            lastEdit: data.meta?.lastEdit || null,
            created: data.meta?.created || null,
            typeCounts,
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (b.lastEdit || '').localeCompare(a.lastEdit || ''));
  }
  const totalElements = boards.reduce((s, b) => s + b.elementCount, 0);
  const totalConnections = boards.reduce((s, b) => s + b.connectionCount, 0);
  const allTypes = {};
  boards.forEach(b => Object.entries(b.typeCounts).forEach(([t, n]) => { allTypes[t] = (allTypes[t] || 0) + n; }));
  res.json({ boards, totalBoards: boards.length, totalElements, totalConnections, allTypes });
});

// ═══════════════════════════════════════════════════════
//  PUBLIC SHARE API (no auth required)
// ═══════════════════════════════════════════════════════

// Public: fetch shared board data (no auth required)
app.post('/api/share/:token', (req, res) => {
  const token = req.params.token.replace(/[^a-zA-Z0-9]/g, '');
  const { password } = req.body;

  const boardsBase = path.join(__dirname, 'data', 'boards');
  let found = null, foundName = null, foundOwner = null;

  if (fs.existsSync(boardsBase)) {
    outer: for (const userDir of fs.readdirSync(boardsBase)) {
      const userPath = path.join(boardsBase, userDir);
      if (!fs.statSync(userPath).isDirectory()) continue;
      for (const file of fs.readdirSync(userPath).filter(f => f.endsWith('.json'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(userPath, file), 'utf8'));
          if (data.meta?.shareToken === token) {
            found = data; foundOwner = userDir; foundName = file.replace('.json', '');
            break outer;
          }
        } catch {}
      }
    }
  }

  if (!found) return res.status(404).json({ error: 'Board not found or sharing disabled' });

  if (found.meta?.sharePasswordHash) {
    if (!password || !bcrypt.compareSync(password, found.meta.sharePasswordHash)) {
      return res.status(401).json({ error: 'Wrong password', needsPassword: true });
    }
  }

  // Strip sensitive fields from meta
  const { sharePasswordHash, shareToken, ...safeMeta } = found.meta || {};
  res.json({
    elements: found.elements || [],
    connections: found.connections || [],
    meta: { ...safeMeta, boardName: foundName, owner: foundOwner },
  });
});

// ═══════════════════════════════════════════════════════
//  LLM PROXY (server-side, uses stored user API key)
// ═══════════════════════════════════════════════════════
app.post('/api/llm/chat', requireAuth, async (req, res) => {
  const { messages, model } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const users = loadUsers();
  const user = users.find(u => u.id === req.session.user.id);
  if (!user || !user.llmProvider || !user.llmApiKey) {
    return res.status(400).json({ error: 'No LLM provider configured. Set provider and API key in your profile.' });
  }

  const provider = user.llmProvider;
  const apiKey = user.llmApiKey;
  const resolvedModel = model || user.llmModel || undefined;
  const systemPrompt = user.llmSystemPrompt || '';

  try {
    let responseText = '';

    if (provider === 'anthropic') {
      const effectiveModel = resolvedModel || 'claude-haiku-4-5-20251001';
      const body = { model: effectiveModel, max_tokens: 4096, messages: messages.map(m => ({ role: m.role, content: m.content })) };
      if (systemPrompt) body.system = systemPrompt;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: d.error?.message || 'Anthropic API error' });
      responseText = d.content?.[0]?.text || '';

    } else if (provider === 'openai') {
      const effectiveModel = resolvedModel || 'gpt-4o-mini';
      const msgs = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: effectiveModel, messages: msgs }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: d.error?.message || 'OpenAI API error' });
      responseText = d.choices?.[0]?.message?.content || '';

    } else if (provider === 'google') {
      const effectiveModel = resolvedModel || 'gemini-2.0-flash';
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const body = { contents };
      if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      );
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: d.error?.message || 'Google API error' });
      responseText = d.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (provider === 'openrouter') {
      const effectiveModel = resolvedModel || 'openai/gpt-4o-mini';
      const msgs = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: effectiveModel, messages: msgs }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: d.error?.message || 'OpenRouter API error' });
      responseText = d.choices?.[0]?.message?.content || '';

    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    res.json({ message: responseText });
  } catch (err) {
    console.error('LLM proxy error:', err);
    res.status(500).json({ error: 'LLM request failed: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  WEBSOCKET — Real-Time Collaboration
// ═══════════════════════════════════════════════════════
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Authenticate WebSocket upgrades using session OR share token
server.on('upgrade', (req, socket, head) => {
  const urlParams = new URLSearchParams((req.url || '').split('?')[1] || '');
  const shareToken = urlParams.get('token');

  if (shareToken) {
    // Anonymous guest connecting via share token
    const cleanToken = shareToken.replace(/[^a-zA-Z0-9]/g, '');
    const boardsBase = path.join(__dirname, 'data', 'boards');
    let foundOwner = null, foundName = null;
    if (fs.existsSync(boardsBase)) {
      outer: for (const userDir of fs.readdirSync(boardsBase)) {
        const userPath = path.join(boardsBase, userDir);
        try { if (!fs.statSync(userPath).isDirectory()) continue; } catch { continue; }
        for (const file of fs.readdirSync(userPath).filter(f => f.endsWith('.json'))) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(userPath, file), 'utf8'));
            if (data.meta?.shareToken === cleanToken) {
              foundOwner = userDir; foundName = file.replace('.json', '');
              break outer;
            }
          } catch {}
        }
      }
    }
    if (!foundOwner) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = { username: `guest`, displayName: 'Guest', role: 'guest' };
      ws.readOnly = true;
      ws.authorizedRoom = `${foundOwner}/${foundName}`;
      wss.emit('connection', ws, req);
    });
    return;
  }

  sessionMiddleware(req, {}, () => {
    if (!req.session?.user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = req.session.user;
      wss.emit('connection', ws, req);
    });
  });
});

const rooms = new Map(); // roomKey ("owner/board") → Set<ws>

function getUserColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360},65%,50%)`;
}

function broadcastPresence(room) {
  const clients = rooms.get(room);
  if (!clients) return;
  const users = [...clients]
    .filter(c => !c.readOnly)
    .map(c => ({
      username: c.user.username,
      displayName: c.user.displayName,
      color: getUserColor(c.user.username),
    }));
  const msg = JSON.stringify({ type: 'presence', users });
  // Only send presence to authenticated users (not read-only guests)
  clients.forEach(c => { if (!c.readOnly && c.readyState === 1) c.send(msg); });
}

function broadcastToRoom(room, senderWs, payload) {
  const clients = rooms.get(room);
  if (!clients) return;
  const str = JSON.stringify(payload);
  clients.forEach(c => { if (c !== senderWs && c.readyState === 1) c.send(str); });
}

function leaveRoom(ws) {
  if (!ws.currentRoom) return;
  const room = ws.currentRoom;
  const clients = rooms.get(room);
  if (clients) { clients.delete(ws); if (clients.size === 0) rooms.delete(room); }
  ws.currentRoom = null;
  broadcastPresence(room);
}

wss.on('connection', (ws) => {
  ws.currentRoom = null;

  // Read-only guest: auto-join authorized room and send current state snapshot
  if (ws.readOnly && ws.authorizedRoom) {
    const room = ws.authorizedRoom;
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(ws);
    ws.currentRoom = room;
    // Send current board state as initial snapshot
    const [ownerDir, boardFile] = room.split('/');
    const boardPath = path.join(__dirname, 'data', 'boards', ownerDir, boardFile + '.json');
    if (fs.existsSync(boardPath)) {
      try {
        const bd = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
        ws.send(JSON.stringify({ type: 'state', elements: bd.elements || [], connections: bd.connections || [] }));
      } catch {}
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Guests are read-only — ignore everything they send
    if (ws.readOnly) return;

    if (msg.type === 'join') {
      const parts = (msg.room || '').split('/');
      const cleanOwner = (parts[0] || '').replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanBoard = (parts[1] || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!cleanOwner || !cleanBoard) return;

      const username = ws.user.username;
      const isOwner = cleanOwner === username;
      const isAdmin = ws.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        const boardPath = path.join(__dirname, 'data', 'boards', cleanOwner, cleanBoard + '.json');
        if (!fs.existsSync(boardPath)) return;
        try {
          const data = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
          if (!(data.meta?.collaborators || []).includes(username)) return;
        } catch { return; }
      }

      const room = `${cleanOwner}/${cleanBoard}`;
      if (ws.currentRoom && ws.currentRoom !== room) {
        const prev = rooms.get(ws.currentRoom);
        if (prev) { prev.delete(ws); if (prev.size === 0) rooms.delete(ws.currentRoom); }
        broadcastPresence(ws.currentRoom);
      }
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      ws.currentRoom = room;
      broadcastPresence(room);
    }

    if (msg.type === 'state' && ws.currentRoom) {
      broadcastToRoom(ws.currentRoom, ws, {
        type: 'state',
        from: ws.user.username,
        displayName: ws.user.displayName,
        elements: msg.elements,
        connections: msg.connections,
        seq: msg.seq,
      });
    }

    if (msg.type === 'cursor' && ws.currentRoom) {
      broadcastToRoom(ws.currentRoom, ws, {
        type: 'cursor',
        from: ws.user.username,
        displayName: ws.user.displayName,
        x: msg.x,
        y: msg.y,
      });
    }

    if (msg.type === 'leave') leaveRoom(ws);
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// ═══════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WOLLMILCHSAU running on port ${PORT}`);
  console.log('Default login: admin / admin');
});
