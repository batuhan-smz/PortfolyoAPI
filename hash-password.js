// hash-password.js (Yeni şifre için tekrar kullanım)
const argon2 = require('argon2');

// ---- BURAYA YENİ GÜÇLÜ ŞİFRENİZİ YAZIN ----
const newPasswordToHash = 'Portfolyo61'; // <<< 1. Adımda belirlediğin YENİ şifreyi buraya yaz
// -------------------------------------------

async function hashNewPassword() {
  if (!newPasswordToHash || newPasswordToHash === 'YeniGucluSifre567!') {
       console.error("Lütfen dosya içindeki 'newPasswordToHash' değişkenini YENİ güçlü şifrenizle değiştirin!");
       return;
  }
  try {
    console.log(`'${newPasswordToHash}' şifresi hashleniyor...`);
    const hash = await argon2.hash(newPasswordToHash);
    console.log('\nOluşturulan YENİ Argon2 Hash:');
    console.log(hash); // <<< BU YENİ ÇIKTIYI KOPYALAYIN!
    console.log('\n>>> Bu YENİ hash değerini .env dosyasındaki ESKİ ADMIN_PASSWORD_HASH değeriyle değiştirin.');
    console.log('>>> Ayrıca Vercel ortam değişkenlerini de güncellemeyi unutmayın!');
  } catch (err) {
    console.error('Yeni şifre hashlenirken hata:', err);
  }
}

hashNewPassword();