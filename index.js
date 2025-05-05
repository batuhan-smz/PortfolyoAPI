require('dotenv').config(); // .env dosyasındaki değişkenleri yükler
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
//const adminRouter = require('./routes/admin');

// --- Firebase Admin SDK Başlatma (Duplicate Check ile) ---
let db; // db'yi burada tanımla

// Sadece HİÇ uygulama başlatılmamışsa initializeApp çağır
if (!admin.apps.length) { // <<< Mevcut uygulama sayısını kontrol et
  console.log("Firebase Admin: Başlatma işlemi deneniyor...");
  let serviceAccount;
  const serviceAccountJsonContent = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_KEY_PATH; // Yerel için

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
  } catch (error) {
      console.error("Firebase Admin SDK başlatılırken hata oluştu (muhtemelen zaten vardı):", error);
      // Eğer zaten varsa bu hatayı görmezden gelebiliriz veya sadece loglayabiliriz.
      // process.exit(1); // Buradan çıkmak yerine devam edelim.
  }
} else {
    console.log("Firebase Admin: Varsayılan uygulama zaten başlatılmış.");
}

// db örneğini her durumda almaya çalış (başlatılmış olması lazım)
try {
    db = admin.firestore();
    console.log("Firestore DB örneği alındı.");
} catch(error) {
    console.error("Firestore DB örneği alınırken hata:", error);
    // DB olmadan API çalışmaz, burada çıkmak mantıklı olabilir
     process.exit(1);
}
// --- Firebase Init Sonu ---

const app = express();

// --- Express Ayarları ---
app.set('view engine', 'ejs'); // <<< Express'e view engine olarak EJS kullanacağını söyle
app.set('views', path.join(__dirname, 'views')); // <<< View (şablon) dosyalarının nerede bulunacağını belirt ('views' klasörü)

// --- Middleware'ler ---
app.use(cors({origin: [
  'http://localhost:3000', // Next.js yerel geliştirme adresin (port farklıysa değiştir)
  process.env.FRONTEND_URL  // Vercel'e deploy ettiğin frontend adresin (.env'den gelecek)
  // Başka izin vermek istediğin adresler varsa buraya ekle
],
credentials: true}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Middleware fonksiyonu artık burada tanımlı değil

// --- Rotaları Bağlama ---
//app.use('/admin', adminRouter); // <<< /admin ile başlayan tüm istekleri adminRouter'a yönlendir
// app.use('/api', apiRouter); // <<< Eğer API rotalarını da ayırdıysan

function checkDb(db){
    if (!db) { // <<< db örneği var mı kontrol et
      console.error("GET /api/projects: DB başlatılamamış!");
      return res.status(500).send("Sunucu hatası: Veritabanı bağlantısı yok.");
  }
}

// --- API Rotaları (Endpoints) ---

// ÖNEMLİ: Artık tüm route handler'lar 'db' değişkenini kullanmalı ve varlığını kontrol etmeli
app.get('/api/projects', async (req, res) => {
  checkDb(db);
  try {
    const projectsRef = db.collection('projects');
    const snapshot = await projectsRef.orderBy('createdAt', 'desc').get();
    let projects = [];
    if (!snapshot.empty) {
        snapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
    }
    res.status(200).json(projects);
  } catch (error) {
    console.error("Error getting projects: ", error);
    res.status(500).send("Internal Server Error");
  }
});

// GET /api/projects/:id - Tek bir projeyi getir (Herkese Açık)
app.get('/api/projects/:id', async (req, res) => {
  checkDb(db);
    try {
        const projectId = req.params.id;
        const projectRef = db.collection('projects').doc(projectId);
        const doc = await projectRef.get();

        if (!doc.exists) {
            return res.status(404).send('Project not found');
        }

        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        console.error("Error getting project: ", error);
        res.status(500).send("Internal Server Error");
    }
});

// --- KORUMALI ROTALAR İÇİN AUTH MIDDLEWARE ---
// İki Yaklaşım Var:
// 1. Firebase Authentication Kullanımı (Önerilen):
//    React tarafında Firebase Auth ile login olunur, alınan ID Token API'ye gönderilir.
//    API'de bu token doğrulanır.
// 2. Kendi JWT Sisteminizi Kurma:
//    Bir /login rotası oluşturup admin şifresi ile JWT üretirsiniz.

// Örnek: Firebase Auth ID Token Doğrulama Middleware'i
const checkAuth = async (req, res, next) => {
  checkDb(db);
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken; // Doğrulanmış kullanıcı bilgisini isteğe ekle
      // İsteğe bağlı: Sadece belirli bir admin UID'sinin işlem yapmasına izin ver
      // if (decodedToken.uid !== process.env.ADMIN_FIREBASE_UID) {
      //   return res.status(403).send('Forbidden: Not authorized');
      // }
      return next(); // Token geçerli, sonraki adıma geç
    } catch (error) {
      console.error('Error while verifying Firebase ID token:', error);
      return res.status(403).send('Unauthorized: Invalid token');
    }
  } else {
    return res.status(401).send('Unauthorized: No token provided');
  }
};

// POST /api/projects - Yeni proje ekle (Korumalı)
app.post('/api/projects', checkAuth, async (req, res) => {
  checkDb(db);
  try {
    const { title, description, technologies, imageUrl, projectUrl, repoUrl } = req.body;

    // Basit girdi kontrolü (daha kapsamlısı için express-validator gibi kütüphaneler kullanın)
    if (!title || !description) {
      return res.status(400).send('Missing required fields: title, description');
    }

    const newProject = {
      title,
      description,
      technologies: technologies || [], // Eğer gönderilmezse boş dizi
      imageUrl: imageUrl || '',
      projectUrl: projectUrl || '',
      repoUrl: repoUrl || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp() // Ekleme tarihi
    };

    const docRef = await db.collection('projects').add(newProject);
    res.status(201).json({ id: docRef.id, ...newProject });

  } catch (error) {
    console.error("Error adding project: ", error);
    res.status(500).send("Internal Server Error");
  }
});

// PUT /api/projects/:id - Projeyi güncelle (Korumalı)
app.put('/api/projects/:id', checkAuth, async (req, res) => {
  checkDb(db);
    try {
        const projectId = req.params.id;
        const projectRef = db.collection('projects').doc(projectId);
        const doc = await projectRef.get();

        if (!doc.exists) {
            return res.status(404).send('Project not found');
        }

        // Sadece gönderilen alanları güncellemek için set({ ... }, { merge: true }) kullanmak daha iyi olabilir
        // Veya tüm alanları bekleyip hepsini gönderebilirsiniz.
        const updateData = req.body; // title, description etc.
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

        await projectRef.update(updateData);

        res.status(200).json({ id: projectId, ...updateData});

    } catch (error) {
        console.error("Error updating project: ", error);
        res.status(500).send("Internal Server Error");
    }
});

 // DELETE /api/projects/:id - Projeyi sil (Korumalı)
app.delete('/api/projects/:id', checkAuth, async (req, res) => {
  checkDb(db);
    try {
        const projectId = req.params.id;
        const projectRef = db.collection('projects').doc(projectId);
        const doc = await projectRef.get();

        if (!doc.exists) {
            return res.status(404).send('Project not found');
        }

        await projectRef.delete();
        res.status(200).send(`Project with ID: ${projectId} deleted successfully.`);

    } catch (error) {
        console.error("Error deleting project: ", error);
        res.status(500).send("Internal Server Error");
    }
});



// ---- Sunucu Başlatma ve Export ----
// Yerelde çalıştırmak için listen kısmı kalabilir, Vercel için export gerekli
if (process.env.NODE_ENV !== 'production') { // Veya Vercel dışı bir ortam kontrolü
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`API Server running on port ${PORT}`);
      // console.log(`AdminJS panelini http://localhost:<span class="math-inline">\{PORT\}</span>{adminJs.options.rootPath} adresinde deneyebilirsin (henüz login yok)`);
    });
}

module.exports = { app, db };