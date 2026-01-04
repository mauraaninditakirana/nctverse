const express = require('express');
const mysql = require('mysql2');
const app = express();
const port = 3000;

// ==========================================
// 1. KONEKSI DATABASE
// ==========================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'nct_archive'
});

db.connect((err) => {
    if (err) console.error('❌ DB Error:', err);
    else console.log('✅ Connected to NCTverse Database!');
});

// Setup EJS & Public Folder
app.set('view engine', 'ejs');
app.use(express.static('public')); 

// --- RUTE HOME ---
app.get('/', (req, res) => {
    db.query('SELECT * FROM units', (err, results) => {
        if (err) throw err;
        res.render('index', { units: results });
    });
});

// --- RUTE DETAIL UNIT (Baru!) ---
app.get('/unit/:id', (req, res) => {
    const unitId = req.params.id;

    // Query 1: Ambil Data Unit (Judul, Deskripsi)
    const sqlUnit = 'SELECT * FROM units WHERE id = ?';
    
    // Query 2: Ambil Member yg ada di unit ini (Pakai JOIN table pivot)
    const sqlMembers = `
        SELECT m.* FROM members m 
        JOIN member_unit mu ON m.id = mu.member_id 
        WHERE mu.unit_id = ?`;

    // Query 3: Ambil Album milik unit ini
    const sqlAlbums = 'SELECT * FROM albums WHERE unit_id = ?';

    // EKSEKUSI QUERY BERTINGKAT (Callback Nested)
    db.query(sqlUnit, [unitId], (err, resultUnit) => {
        if (err) throw err;
        
        // Cek jika unit tidak ditemukan
        if (resultUnit.length === 0) return res.send('Unit tidak ditemukan!');

        db.query(sqlMembers, [unitId], (err, resultMembers) => {
            if (err) throw err;

            db.query(sqlAlbums, [unitId], (err, resultAlbums) => {
                if (err) throw err;

                // Kirim semua data ke unit.ejs
                res.render('unit', {
                    unit: resultUnit[0],
                    members: resultMembers,
                    albums: resultAlbums
                });
            });
        });
    });
});

// jalankn server
app.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});