const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

// 1. Konfigurasi Koneksi Database
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      
    password: '',      
    database: 'nct_archive' 
});

// 2. Cek Koneksi
db.connect((err) => {
    if (err) {
        console.error('❌ Gagal konek ke database:', err);
    } else {
        console.log('✅ Berhasil konek ke Database NCTverse!');
    }
});

// 3. Setup View Engine EJS
app.set('view engine', 'ejs');
app.use(express.static('public')); 

// DAFTAR RUTE (ROUTES)
// RUTE 1: HALAMAN DEPAN (HOME)
// Mengambil semua data dari tabel 'units'
app.get('/', (req, res) => {
    const sql = 'SELECT * FROM units';
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            res.send('Gagal mengambil data dari database.');
        } else {
            // Render file views/index.ejs dan kirim data 'units'
            res.render('index', { units: results });
        }
    });
});

// JALANKAN SERVER

app.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});