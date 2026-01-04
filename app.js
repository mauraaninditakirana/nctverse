const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

// 1. Konfigurasi Koneksi Database (Sambung ke Laragon)
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // User default Laragon/XAMPP
    password: '',      // Password biasanya kosong
    database: 'nct_archive' // Nama database yang kita buat tadi
});

// 2. Cek Koneksi Database
db.connect((err) => {
    if (err) {
        console.error('❌ Gagal konek ke database:', err);
    } else {
        console.log('✅ Berhasil konek ke Database NCTverse!');
    }
});

// 3. Setting View Engine (Supaya bisa baca file EJS)
app.set('view engine', 'ejs');
app.use(express.static('public')); // Untuk folder gambar/css nanti

// 4. Rute Halaman Utama (Tes Server)
app.get('/', (req, res) => {
    res.send('<h1>Halo! Server NCTverse Berjalan! 💚</h1>');
});

// 5. Jalankan Server
app.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});