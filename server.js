const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Ensure directories exist
['uploads', 'data'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    url: '/uploads/' + req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// Save board
app.post('/api/boards/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(__dirname, 'data', name + '.json');
  // Preserve created date if exists
  let created = new Date().toISOString();
  if (fs.existsSync(filePath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (prev.meta && prev.meta.created) created = prev.meta.created;
    } catch(e) {}
  }
  const data = { ...req.body, meta: { created, lastEdit: new Date().toISOString(), elementCount: (req.body.elements || []).length } };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// Rename board
app.post('/api/boards/:name/rename', (req, res) => {
  const oldName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const newName = (req.body.newName || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!newName) return res.status(400).json({ error: 'Invalid name' });
  const oldPath = path.join(__dirname, 'data', oldName + '.json');
  const newPath = path.join(__dirname, 'data', newName + '.json');
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Board not found' });
  if (fs.existsSync(newPath)) return res.status(409).json({ error: 'Name already exists' });
  fs.renameSync(oldPath, newPath);
  res.json({ success: true, newName });
});

// Load board
app.get('/api/boards/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(__dirname, 'data', name + '.json');
  if (!fs.existsSync(filePath)) return res.json({ elements: [], connections: [] });
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json(data);
});

// Delete board
app.delete('/api/boards/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(__dirname, 'data', name + '.json');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Board not found' });
  }
});

// List boards (with metadata)
app.get('/api/boards', (req, res) => {
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  const boards = files.map(f => {
    const name = f.replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
      return {
        name,
        created: data.meta?.created || null,
        lastEdit: data.meta?.lastEdit || null,
        elementCount: data.meta?.elementCount || (data.elements || []).length,
      };
    } catch(e) {
      return { name, created: null, lastEdit: null, elementCount: 0 };
    }
  });
  // Sort by lastEdit descending
  boards.sort((a, b) => (b.lastEdit || '').localeCompare(a.lastEdit || ''));
  res.json(boards);
});

// Export board as image (receives base64 data)
app.post('/api/export', (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'No data' });
  const base64 = data.replace(/^data:image\/png;base64,/, '');
  const filename = 'export-' + Date.now() + '.png';
  fs.writeFileSync(path.join(__dirname, 'uploads', filename), base64, 'base64');
  res.json({ url: '/uploads/' + filename });
});

app.listen(PORT, () => {
  console.log(`WOLLMILCHSAU running at http://localhost:${PORT}`);
});
