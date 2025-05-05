// middleware/auth.js
function requireAdminLogin(req, res, next) {
    // Eğer session varsa VE session içinde isAdmin=true ise:
    if (req.session && req.session.isAdmin) {
        // Kullanıcı giriş yapmış, sonraki adıma geç
        next();
    } else {
        // Kullanıcı giriş yapmamış, login sayfasına yönlendir
        // Not: Eğer bu middleware /admin dışındaki bir yerde kullanılmayacaksa
        // yönlendirme /admin/login olmalı. Eğer /admin base path'i router'da
        // tanımlanacaksa, burada sadece /login'e yönlendirmek yeterli olabilir.
        // Şimdilik /admin/login olarak bırakalım.
        res.redirect('/admin/login');
    }
}

// Fonksiyonu export et
module.exports = { requireAdminLogin };