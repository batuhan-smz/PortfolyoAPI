// routes/admin.js (Düzeltilmiş ve Birleştirilmiş Hali)
const express = require('express');
const argon2 = require('argon2');
const { requireAdminLogin } = require('../middleware/auth'); // Middleware yolu
// const adminFirebase = require('firebase-admin'); // 'admin' parametresi Firebase SDK'yı temsil edecek

module.exports = (db, admin) => { // 'admin' parametresi Firebase Admin SDK örneği
    const router = express.Router();

    // --- Login Rotaları ---
    router.get('/login', (req, res) => {
        if (req.session && req.session.isAdmin) {
           return res.redirect('/admin/dashboard');
        }
        res.render('admin/login', { error: null });
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
                    return req.session.save((err) => { // return eklendi
                        if (err) { return res.render('admin/login', { error: 'Oturum başlatılamadı.' }); }
                        console.log(`Admin Login Successful: ${email}`);
                        res.redirect('/admin/dashboard');
                    });
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

    // --- Proje Silme Rotası ---
    router.post('/projects/delete/:id', requireAdminLogin, async (req, res) => {
        const projectId = req.params.id;
        if (!db) { return res.redirect('/admin/dashboard'); }
        if (!projectId) { return res.redirect('/admin/dashboard'); }
        try {
            await db.collection('projects').doc(projectId).delete();
            console.log(`Project with ID: ${projectId} deleted by admin.`);
            res.redirect('/admin/dashboard');
        } catch (error) {
            console.error(`Error deleting project ${projectId}:`, error);
            res.redirect('/admin/dashboard');
        }
    });

    // --- Yeni Proje Ekleme Formunu Göster ---
    router.get('/projects/new', requireAdminLogin, (req, res) => {
        res.render('admin/project-form', {
            project: {}, // Boş proje nesnesi
            editing: false, // Ekleme modunda olduğunu belirt
            error: null,
            user: req.session.user
        });
    });

    // --- Yeni Proje Ekleme İşlemini Yap ---
    router.post('/projects/new', requireAdminLogin, async (req, res) => {
        if (!db) { return res.status(500).send("Veritabanı hatası"); }
        const { title, description, technologies, imageUrl, projectUrl, repoUrl } = req.body;
        if (!title || !description) {
            return res.render('admin/project-form', {
                project: req.body, error: "Başlık ve Açıklama alanları zorunludur.",
                user: req.session.user, editing: false
            });
        }
        try {
            const newProjectData = {
                title, description,
                technologies: technologies ? technologies.split(',').map(tech => tech.trim()).filter(tech => tech) : [],
                imageUrl: imageUrl || '', projectUrl: projectUrl || '', repoUrl: repoUrl || '',
                createdAt: admin.firestore.FieldValue.serverTimestamp() // 'admin' Firebase SDK örneği
            };
            await db.collection('projects').add(newProjectData);
            console.log("New project added by admin:", title);
            res.redirect('/admin/dashboard');
        } catch (error) {
            console.error("Error adding new project:", error);
            res.render('admin/project-form', {
                project: req.body, error: "Proje eklenirken bir sunucu hatası oluştu.",
                user: req.session.user, editing: false
            });
        }
    });

    // --- Proje Düzenleme Rotaları (ŞİMDİ EKLİYORUZ) ---

    // GET /admin/projects/edit/:id - Düzenleme formunu gösterir
    router.get('/projects/edit/:id', requireAdminLogin, async (req, res) => {
        if (!db) { return res.status(500).send("Veritabanı hatası"); }
        const projectId = req.params.id;
        try {
            const projectDoc = await db.collection('projects').doc(projectId).get();
            if (!projectDoc.exists) {
                console.log(`Edit: Project with ID ${projectId} not found.`);
                return res.redirect('/admin/dashboard'); // Veya 404 sayfası
            }
            res.render('admin/project-form', {
                project: { id: projectDoc.id, ...projectDoc.data() },
                editing: true, // Düzenleme modunda olduğunu belirt
                error: null,
                user: req.session.user
            });
        } catch (error) {
            console.error(`Error fetching project ${projectId} for edit:`, error);
            res.redirect('/admin/dashboard'); // Hata durumunda dashboard'a yönlendir
        }
    });

    // POST /admin/projects/edit/:id - Düzenleme işlemini yapar
    router.post('/projects/edit/:id', requireAdminLogin, async (req, res) => {
        if (!db) { return res.status(500).send("Veritabanı hatası"); }
        const projectId = req.params.id;
        const { title, description, technologies, imageUrl, projectUrl, repoUrl } = req.body;

        if (!title || !description) {
            // Düzenleme sırasında hata olursa, mevcut proje verilerini forma geri göndermeliyiz
            // Ancak req.body zaten güncel verileri içerdiği için tekrar çekmeye gerek yok gibi
            return res.render('admin/project-form', {
                project: { id: projectId, ...req.body }, // ID'yi koru, form verilerini kullan
                editing: true,
                error: "Başlık ve Açıklama alanları zorunludur.",
                user: req.session.user
            });
        }

        try {
            const projectDataToUpdate = {
                title, description,
                technologies: technologies ? technologies.split(',').map(tech => tech.trim()).filter(tech => tech) : [],
                imageUrl: imageUrl || '', projectUrl: projectUrl || '', repoUrl: repoUrl || '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp() // 'admin' Firebase SDK örneği
            };
            await db.collection('projects').doc(projectId).update(projectDataToUpdate);
            console.log(`Project with ID: ${projectId} updated by admin.`);
            res.redirect('/admin/dashboard');
        } catch (error) {
            console.error(`Error updating project ${projectId}:`, error);
            res.render('admin/project-form', {
                project: { id: projectId, ...req.body },
                editing: true,
                error: "Proje güncellenirken bir sunucu hatası oluştu.",
                user: req.session.user
            });
        }
    });

    return router;
};