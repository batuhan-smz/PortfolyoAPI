// routes/admin.js (Fonksiyon Olarak Export Edilen Hali)
const express = require('express');
const argon2 = require('argon2');
const { requireAdminLogin } = require('../middleware/auth'); // Middleware yolu doğru mu?
// const admin = require('firebase-admin'); // 'admin' örneğini parametre olarak alacağız
// const db = admin.firestore(); // db'yi parametre olarak alacağız

// module.exports artık bir fonksiyon olacak:
module.exports = (db, admin) => { // <<< db ve admin parametreleri eklendi
    const router = express.Router();

    // --- Login Rotaları ---
    router.get('/login', (req, res) => {
        if (req.session && req.session.isAdmin) {
           return res.redirect('/admin/dashboard'); // Tam yolu kullan
        }
        res.render('admin/login', { error: null }); // views/admin/login.ejs
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminEmail || !adminPasswordHash) {
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
                        res.redirect('/admin/dashboard'); // Başarılı giriş sonrası
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

    // --- Logout Rotası ---
    router.get('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) { console.error("Session sonlandırma hatası:", err); }
            res.redirect('/admin/login');
        });
    });

    // --- Dashboard Rotası ---
    router.get('/dashboard', requireAdminLogin, async (req, res) => {
        // db parametresini burada kullan
        if (!db) { return res.status(500).render('admin/dashboard', { projects: [], user: req.session.user, error: "Veritabanı bağlantı hatası." }); }
        try {
            const projectsRef = db.collection('projects');
            const snapshot = await projectsRef.orderBy('createdAt', 'desc').get();
            let projects = [];
            if (!snapshot.empty) { snapshot.forEach(doc => { projects.push({ id: doc.id, ...doc.data() }); }); }
            res.render('admin/dashboard', { projects: projects, user: req.session.user, error: null });
        } catch (error) {
            console.error("Admin dashboard projeleri çekilirken hata:", error);
            res.render('admin/dashboard', { projects: [], user: req.session.user, error: "Projeler yüklenirken bir hata oluştu." });
        }
    });

    // --- Proje CRUD Rotaları (Placeholder) ---
    // GET /admin/projects/new
    // POST /admin/projects/new
    // GET /admin/projects/edit/:id
    // POST /admin/projects/edit/:id
    // POST /admin/projects/delete/:id (Bu route'u birazdan ekleyeceğiz)

    return router; // <<< Yapılandırılmış router'ı döndür
}; // <<< Fonksiyon burada bitiyor