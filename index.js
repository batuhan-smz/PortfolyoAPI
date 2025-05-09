// index.js (Düzeltilmiş Yapı)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const session = require('express-session');
const path = require('path');
const adminRouterFn = require('./routes/admin'); // <<< Admin router fonksiyonunu import edeceğiz (henüz değil)
// const { checkAuth } = require('./middleware/firebaseAuth'); // <<< Auth middleware'ini de taşıyabiliriz

// --- Firebase Admin SDK Başlatma (Doğru Hali) ---
let db;
if (!admin.apps.length) {
    console.log("Firebase Admin: Başlatma işlemi deneniyor...");
    let serviceAccount;
    const serviceAccountJsonContent = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_KEY_PATH;
    if (serviceAccountJsonContent) {
        console.log("Firebase Admin: JSON içeriği ortam değişkeninden okunuyor.");
        try { serviceAccount = JSON.parse(serviceAccountJsonContent); }
        catch (e) { console.error("JSON parse hatası:", e); process.exit(1); }
    } else if (serviceAccountPath) {
        console.log(`Firebase Admin: Anahtar ${serviceAccountPath} yolundan okunuyor.`);
        try { serviceAccount = require(serviceAccountPath); }
        catch (e) { console.error(`Anahtar dosyası (${serviceAccountPath}) okuma hatası:`, e); process.exit(1); }
    } else {
        console.error("Firebase Admin kimlik bilgisi bulunamadı!"); process.exit(1);
    }
    try {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log("Firebase Admin SDK başarıyla başlatıldı.");
    } catch (error) { console.error("Firebase Admin SDK başlatılırken hata oluştu:", error); }
} else { console.log("Firebase Admin: Varsayılan uygulama zaten başlatılmış."); }
try { db = admin.firestore(); console.log("Firestore DB örneği alındı."); }
catch(error) { console.error("Firestore DB örneği alınırken hata:", error); process.exit(1); }
// --- Firebase Init Sonu ---

const app = express();

// --- Express Ayarları ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middleware'ler (Doğru Sırada) ---
app.use(cors({
    origin: [ 'http://localhost:3000', process.env.FRONTEND_URL,'https://www.batuhansemiz.com','https://batuhansemiz.com' ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ // <<< Session middleware'i rotalardan ÖNCE
    secret: process.env.ADMIN_SESSION_SECRET || 'varsayilan-cok-gizli-bir-anahtar',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// --- Özel Middleware'ler ---
// DB Bağlantı Kontrolü
const checkDbMiddleware = (req, res, next) => {
  if (!db) {
    console.error(`DB check failed for route: ${req.originalUrl}`);
    return res.status(500).send("Sunucu hatası: Veritabanı bağlantısı kullanılamıyor.");
  }
  next();
};

// API Auth Kontrolü (Firebase ID Token)
const checkAuth = async (req, res, next) => { // <<< Bunu da middleware klasörüne taşıyabilirsin
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        const idToken = req.headers.authorization.split('Bearer ')[1];
        try {
            req.user = await admin.auth().verifyIdToken(idToken);
            return next();
        } catch (error) {
            console.error('Error while verifying Firebase ID token:', error);
            return res.status(403).send('Unauthorized: Invalid token');
        }
    } else {
        return res.status(401).send('Unauthorized: No token provided');
    }
};

//*********************************************************
// <<< YENİ: KÖK YOLA GELEN İSTEKLERİ YÖNLENDİRME >>>
//*********************************************************
app.get('/', (req, res) => {
    // Doğrudan /admin/login yoluna yönlendir
    res.redirect('/admin/login');
  });
  //*********************************************************

// --- Rotaları Bağlama ---
const adminRouter = adminRouterFn(db, admin); // <<< Router fonksiyonunu db ve admin ile çağır
app.use('/admin', adminRouter); // <<< Admin router'ını /admin yoluna bağla

// --- API Rotaları ---
// Tüm API rotaları için db kontrolü eklendi
app.get('/api/projects', checkDbMiddleware, async (req, res) => {
    try {
        const projectsRef = db.collection('projects');
        const snapshot = await projectsRef.orderBy('createdAt', 'desc').get();
        let projects = [];
        if (!snapshot.empty) { snapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() })); }
        res.status(200).json(projects);
    } catch (error) { console.error("Error getting projects: ", error); res.status(500).send("Internal Server Error"); }
});

app.get('/api/projects/:id', checkDbMiddleware, async (req, res) => {
    try {
        const projectId = req.params.id;
        const projectRef = db.collection('projects').doc(projectId);
        const doc = await projectRef.get();
        if (!doc.exists) { return res.status(404).send('Project not found'); }
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) { console.error("Error getting project: ", error); res.status(500).send("Internal Server Error"); }
});

// Korumalı API rotaları (checkAuth ve checkDbMiddleware kullanıyor)
app.post('/api/projects', checkAuth, checkDbMiddleware, async (req, res) => {
    try {
        const { title, description, technologies, imageUrl, projectUrl, repoUrl } = req.body;
        if (!title || !description) { return res.status(400).send('Missing required fields'); }
        const newProject = { title, description, technologies: technologies || [], imageUrl: imageUrl || '', projectUrl: projectUrl || '', repoUrl: repoUrl || '', createdAt: admin.firestore.FieldValue.serverTimestamp() };
        const docRef = await db.collection('projects').add(newProject);
        res.status(201).json({ id: docRef.id, ...newProject });
    } catch (error) { console.error("Error adding project: ", error); res.status(500).send("Internal Server Error"); }
});

app.put('/api/projects/:id', checkAuth, checkDbMiddleware, async (req, res) => {
    try {
        const projectId = req.params.id;
        const projectRef = db.collection('projects').doc(projectId);
        const doc = await projectRef.get();
        if (!doc.exists) { return res.status(404).send('Project not found'); }
        const updateData = req.body;
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await projectRef.update(updateData);
        res.status(200).json({ id: projectId, ...updateData});
    } catch (error) { console.error("Error updating project: ", error); res.status(500).send("Internal Server Error"); }
});

app.delete('/api/projects/:id', checkAuth, checkDbMiddleware, async (req, res) => {
    try {
        const projectId = req.params.id;
        const projectRef = db.collection('projects').doc(projectId);
        const doc = await projectRef.get();
        if (!doc.exists) { return res.status(404).send('Project not found'); }
        await projectRef.delete();
        res.status(200).send(`Project with ID: ${projectId} deleted successfully.`);
    } catch (error) { console.error("Error deleting project: ", error); res.status(500).send("Internal Server Error"); }
});


// --- Sunucu Başlatma ---
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`API Server running on port ${PORT}`);
      // console.log(`Admin paneli http://localhost:${PORT}/admin/login adresinde`); // Admin router eklenince bu logu açabiliriz
    });
}

// --- Vercel Export ---
module.exports = app; // <<< Sadece app export ediliyor