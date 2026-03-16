const express = require('express');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

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

app.use(session({
  secret: 'wollmilchsau-secret-' + (process.env.SESSION_SECRET || 'dev-2026'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
  },
}));

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
app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));

// ═══════════════════════════════════════════════════════
//  PAGE ROUTES
// ═══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

app.post('/api/auth/register', (req, res) => {
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
    return res.json({ user: req.session.user });
  }
  res.status(401).json({ error: 'Not authenticated' });
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
  if (fs.existsSync(filePath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (prev.meta && prev.meta.created) created = prev.meta.created;
    } catch (e) {}
  }

  const data = {
    ...req.body,
    meta: {
      created,
      lastEdit: new Date().toISOString(),
      elementCount: (req.body.elements || []).length,
      owner: req.session.user.username,
    },
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

// List boards
app.get('/api/boards', requireAuth, (req, res) => {
  const boardDir = getUserBoardDir(req.session.user.username);
  const files = fs.readdirSync(boardDir).filter(f => f.endsWith('.json'));
  const boards = files.map(f => {
    const name = f.replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(boardDir, f), 'utf8'));
      return {
        name,
        created: data.meta?.created || null,
        lastEdit: data.meta?.lastEdit || null,
        elementCount: data.meta?.elementCount || (data.elements || []).length,
      };
    } catch (e) {
      return { name, created: null, lastEdit: null, elementCount: 0 };
    }
  });
  boards.sort((a, b) => (b.lastEdit || '').localeCompare(a.lastEdit || ''));
  res.json(boards);
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

// Admin suggestions
app.get('/api/admin/suggestions', requireAdmin, (req, res) => {
  if (!fs.existsSync(suggestionsFile)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(suggestionsFile, 'utf8')));
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
//  START
// ═══════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`WOLLMILCHSAU running at http://localhost:${PORT}`);
  console.log('Default login: admin / admin');
});
