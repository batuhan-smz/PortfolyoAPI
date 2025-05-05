// routes/admin.js
const express = require('express');
const argon2 = require('argon2');
const { requireAdminLogin } = require('../middleware/auth');
const admin = require('firebase-admin');

const { db } = require('../index');
const router = express.Router(); // Yeni bir router nesnesi oluştur


// GET /admin/dashboard - Admin panelini gösterir
// requireAdminLogin middleware'i ile korunuyor
router.get('/dashboard', requireAdminLogin, async (req, res) => {
    try {
        // Firestore'dan projeleri çek (API endpoint'indeki gibi)
        const projectsRef = db.collection('projects');
        const snapshot = await projectsRef.orderBy('createdAt', 'desc').get();

        let projects = [];
        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                projects.push({ id: doc.id, ...doc.data() });
            });
        }

        // dashboard.ejs'yi render et ve projeler ile kullanıcı bilgisini gönder
        res.render('admin/dashboard', {
            projects: projects, // Çekilen projeler dizisi
            user: req.session.user, // Session'dan kullanıcı bilgisi
            error: null // Başlangıçta hata yok
        });

    } catch (error) {
        console.error("Admin dashboard projeleri çekilirken hata:", error);
        // Hata durumunda belki boş liste ve hata mesajı ile render et
        res.render('admin/dashboard', {
            projects: [],
            user: req.session.user,
            error: "Projeler yüklenirken bir hata oluştu."
        });
        // Veya genel bir hata sayfası render et
        // res.status(500).send("Internal Server Error");
    }
});

// GET /admin/login - Login sayfasını gösterir
// Not: Router '/admin' altına mount edileceği için buradaki yol sadece '/login'
router.get('/login', (req, res) => {
    if (req.session && req.session.isAdmin) {
       return res.redirect('/admin/dashboard'); // Dashboard'a yönlendir (tam yolu kullanalım)
    }
    res.render('admin/login', { error: null }); // 'admin/' prefix'i render'da kalmalı çünkü views klasör yapımız öyle
});

// POST /admin/login - Login işlemini yapar
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminPasswordHash) {
        console.error("'.env' dosyasında ADMIN_EMAIL veya ADMIN_PASSWORD_HASH tanımlı değil!");
        return res.render('admin/login', { error: 'Sunucu yapılandırma hatası.' });
    }

    if (email === adminEmail) {
        try {
            if (await argon2.verify(adminPasswordHash, password)) {
                req.session.isAdmin = true;
                req.session.user = { email: adminEmail };
                req.session.save((err) => {
                    if (err) { return res.render('admin/login', { error: 'Oturum başlatılamadı.' }); }
                    console.log(`Admin Login Successful: ${email}`);
                    res.redirect('/admin/dashboard'); // Başarılı giriş sonrası dashboard'a yönlendir
                });
                return;
            }
        } catch (err) {
            console.error('Argon2 doğrulama hatası:', err);
            return res.render('admin/login', { error: 'Giriş sırasında bir hata oluştu.' });
        }
    }

    console.log(`Admin Login Failed: ${email}`);
    res.render('admin/login', { error: 'Geçersiz e-posta veya şifre.' });
});

// GET /admin/logout - Oturumu sonlandırır
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) { console.error("Session sonlandırma hatası:", err); }
        res.redirect('/admin/login'); // Login sayfasına yönlendir
    });
});

// GET /admin/dashboard - Admin panelini gösterir (SONRAKİ ADIM)
// requireAdminLogin middleware'i bu ve sonraki tüm admin rotalarında kullanılacak
router.get('/dashboard', requireAdminLogin, (req, res) => {
    // Buraya dashboard.ejs render kodu gelecek
    res.send('Admin Dashboard - Hoş Geldiniz!'); // Şimdilik basit bir mesaj
});


// --- Diğer Admin Rotaları (CRUD işlemleri için) ---
// GET /admin/projects/new (Ekleme formu) - requireAdminLogin ile korunacak
// POST /admin/projects/new (Ekleme işlemi) - requireAdminLogin ile korunacak
// GET /admin/projects/edit/:id (Düzenleme formu) - requireAdminLogin ile korunacak
// POST /admin/projects/edit/:id (Düzenleme işlemi) - requireAdminLogin ile korunacak
// POST /admin/projects/delete/:id (Silme işlemi) - requireAdminLogin ile korunacak


// Router'ı export et
module.exports = router;