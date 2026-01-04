const express = require('express');
const session = require('express-session'); // TAMBAHAN: Library Session
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

// ==========================================
// 2. KONFIGURASI SERVER & SESSION
// ==========================================
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// SETUP SESSION (Wajib untuk Login)
app.use(session({
    secret: 'nctverse-secret-key', // Kunci rahasia session
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // Session aktif 24 jam
}));

// MIDDLEWARE: SATPAM PENJAGA ADMIN 👮‍♂️
const cekLogin = (req, res, next) => {
    if (req.session.isLoggedIn === true) {
        next(); // Kalau sudah login, silakan lewat
    } else {
        res.redirect('/login'); // Kalau belum, tendang ke login
    }
};

// ==========================================
// 3. RUTE OTENTIKASI (LOGIN & LOGOUT)
// ==========================================

// Halaman Login
app.get('/login', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/admin');
    }
    res.render('login', { error: null });
});

// Proses Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM admin WHERE username = ? AND password = ?', [username, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            // Login Sukses
            req.session.isLoggedIn = true;
            req.session.adminName = username;
            res.redirect('/admin');
        } else {
            // Login Gagal
            res.render('login', { error: 'Username atau Password salah!' });
        }
    });
});

// Proses Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.redirect('/login');
    });
});

// ==========================================
// 4. RUTE PUBLIK (USER BIASA) - BEBAS AKSES
// ==========================================

// --- HOME ---
app.get('/', (req, res) => {
    db.query('SELECT * FROM units', (err, results) => {
        if (err) throw err;
        res.render('index', { units: results });
    });
});

// --- DETAIL UNIT ---
app.get('/unit/:id', (req, res) => {
    const unitId = req.params.id;
    
    // Ambil Data Unit
    db.query('SELECT * FROM units WHERE id = ?', [unitId], (err, resultUnit) => {
        if (err) throw err;
        if (resultUnit.length === 0) return res.send('Unit tidak ditemukan');

        // Ambil Member di unit ini
        const sqlMembers = `
            SELECT m.* FROM members m 
            JOIN member_unit mu ON m.id = mu.member_id 
            WHERE mu.unit_id = ?`;
        
        db.query(sqlMembers, [unitId], (err, resultMembers) => {
            if (err) throw err;

            // Ambil Album unit ini
            db.query('SELECT * FROM albums WHERE unit_id = ?', [unitId], (err, resultAlbums) => {
                if (err) throw err;

                res.render('unit', {
                    unit: resultUnit[0],
                    members: resultMembers,
                    albums: resultAlbums
                });
            });
        });
    });
});

// --- DETAIL MEMBER ---
app.get('/member/:id', (req, res) => {
    const memberId = req.params.id;

    // Ambil Biodata Member
    db.query('SELECT * FROM members WHERE id = ?', [memberId], (err, resultMember) => {
        if (err) throw err;
        if (resultMember.length === 0) return res.send('Member tidak ditemukan');

        // Ambil Daftar Unit Member Tersebut
        const sqlUnits = `
            SELECT u.nama_unit FROM units u 
            JOIN member_unit mu ON u.id = mu.unit_id 
            WHERE mu.member_id = ?`;

        db.query(sqlUnits, [memberId], (err, resultUnits) => {
            if (err) throw err;

            res.render('member', {
                member: resultMember[0],
                units: resultUnits
            });
        });
    });
});

// --- API ENDPOINTS (DOWNLOAD DATA) ---

// Download Member TXT
app.get('/api/member/:id', (req, res) => {
    const memberId = req.params.id;
    db.query('SELECT * FROM members WHERE id = ?', [memberId], (err, memberData) => {
        if (err) throw err;
        if (memberData.length === 0) return res.send('Data not found');

        const m = memberData[0];
        const content = `
DATA REPORT: NCT ARCHIVE SYSTEM
------------------------------------------
ID Member   : ${m.id}
Nama Panggung: ${m.nama_panggung}
Nama Lengkap : ${m.nama_lengkap}
Asal        : ${m.asal_negara}
Posisi      : ${m.posisi}
------------------------------------------
BIOGRAFI:
${m.biografi || 'Tidak ada data biografi.'}
------------------------------------------
Generated by NCT Open Data Center
        `;
        res.setHeader('Content-disposition', `attachment; filename=data_${m.nama_panggung}.txt`);
        res.set('Content-Type', 'text/plain');
        res.send(content);
    });
});

// Download Tracklist TXT
app.get('/api/album/:id', (req, res) => {
    const albumId = req.params.id;
    db.query('SELECT * FROM albums WHERE id = ?', [albumId], (err, albumData) => {
        if (err) throw err;
        if (albumData.length === 0) return res.send('Album not found');

        db.query('SELECT * FROM songs WHERE album_id = ?', [albumId], (err, songs) => {
            if (err) throw err;
            const a = albumData[0];
            let songListText = "";
            songs.forEach((song, index) => {
                songListText += `${index + 1}. ${song.judul_lagu}\n`;
            });

            const content = `
TRACKLIST REPORT: NCT ARCHIVE
------------------------------------------
Album  : ${a.judul}
Rilis  : ${a.tgl_rilis}
------------------------------------------
DAFTAR LAGU:
${songListText || 'Belum ada data lagu.'}
------------------------------------------
Generated by NCT Open Data Center
            `;
            res.setHeader('Content-disposition', `attachment; filename=tracklist_${a.judul}.txt`);
            res.set('Content-Type', 'text/plain');
            res.send(content);
        });
    });
});

// Download Unit Data TXT
app.get('/api/unit/:id', (req, res) => {
    const unitId = req.params.id;
    db.query('SELECT * FROM units WHERE id = ?', [unitId], (err, unitData) => {
        if (err) throw err;
        if (unitData.length === 0) return res.send('Unit not found');
        const u = unitData[0];
        const content = `
UNIT REPORT: NCT ARCHIVE
------------------------------------------
ID Unit     : ${u.id}
Nama Unit   : ${u.nama_unit}
------------------------------------------
DESKRIPSI:
${u.deskripsi}
------------------------------------------
Generated by NCT Open Data Center
        `;
        res.setHeader('Content-disposition', `attachment; filename=data_${u.nama_unit}.txt`);
        res.set('Content-Type', 'text/plain');
        res.send(content);
    });
});

// ==========================================
// 5. RUTE ADMIN (TERPROTEKSI) 🔐
// ==========================================
// Semua route di bawah ini ada 'cekLogin' nya!

// --- DASHBOARD ---
app.get('/admin', cekLogin, (req, res) => {
    const sqlCount = `
        SELECT 
            (SELECT COUNT(*) FROM units) as totalUnits,
            (SELECT COUNT(*) FROM members) as totalMembers,
            (SELECT COUNT(*) FROM albums) as totalAlbums
    `;

    db.query(sqlCount, (err, results) => {
        if (err) throw err;
        res.render('admin/dashboard', {
            totalUnits: results[0].totalUnits,
            totalMembers: results[0].totalMembers,
            totalAlbums: results[0].totalAlbums
        });
    });
});

// --- KELOLA MEMBERS ---
app.get('/admin/members', cekLogin, (req, res) => {
    const sql = 'SELECT * FROM members ORDER BY id DESC';
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.render('admin/members', { members: results });
    });
});

// Add Member
app.get('/admin/members/add', cekLogin, (req, res) => {
    db.query('SELECT * FROM units', (err, results) => {
        if (err) throw err;
        res.render('admin/member_form', { units: results });
    });
});

app.post('/admin/members/add', cekLogin, (req, res) => {
    const { nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto, units } = req.body;
    const sqlMember = `INSERT INTO members (nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sqlMember, [nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto], (err, result) => {
        if (err) {
            console.error(err);
            return res.send('Gagal menyimpan member.');
        }

        const newMemberId = result.insertId;
        if (units) {
            const unitArray = Array.isArray(units) ? units : [units];
            const values = unitArray.map(unitId => [newMemberId, unitId]);
            const sqlRelasi = 'INSERT INTO member_unit (member_id, unit_id) VALUES ?';
            db.query(sqlRelasi, [values], (err) => {
                if (err) console.error(err);
                res.redirect('/admin/members'); 
            });
        } else {
            res.redirect('/admin/members');
        }
    });
});

// Edit Member
app.get('/admin/members/edit/:id', cekLogin, (req, res) => {
    const memberId = req.params.id;
    db.query('SELECT * FROM members WHERE id = ?', [memberId], (err, memberResult) => {
        if (err) throw err;
        const member = memberResult[0];
        db.query('SELECT * FROM units', (err, unitsResult) => {
            if (err) throw err;
            db.query('SELECT unit_id FROM member_unit WHERE member_id = ?', [memberId], (err, memberUnits) => {
                if (err) throw err;
                const currentUnitIds = memberUnits.map(item => item.unit_id);
                res.render('admin/member_edit', {
                    member: member,
                    units: unitsResult,
                    currentUnitIds: currentUnitIds
                });
            });
        });
    });
});

app.post('/admin/members/update/:id', cekLogin, (req, res) => {
    const memberId = req.params.id;
    const { nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto, units } = req.body;
    const sqlMember = `UPDATE members SET nama_panggung=?, nama_lengkap=?, tgl_lahir=?, asal_negara=?, posisi=?, biografi=?, foto=? WHERE id=?`;

    db.query(sqlMember, [nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto, memberId], (err) => {
        if (err) throw err;
        db.query('DELETE FROM member_unit WHERE member_id = ?', [memberId], (err) => {
            if (err) throw err;
            if (units) {
                const unitArray = Array.isArray(units) ? units : [units];
                const values = unitArray.map(uId => [memberId, uId]);
                db.query('INSERT INTO member_unit (member_id, unit_id) VALUES ?', [values], (err) => {
                    if (err) throw err;
                    res.redirect('/admin/members'); 
                });
            } else {
                res.redirect('/admin/members');
            }
        });
    });
});

// Delete Member
app.get('/admin/members/delete/:id', cekLogin, (req, res) => {
    const memberId = req.params.id;
    db.query('DELETE FROM member_unit WHERE member_id = ?', [memberId], (err) => {
        if (err) throw err;
        db.query('DELETE FROM members WHERE id = ?', [memberId], (err) => {
            if (err) throw err;
            res.redirect('/admin/members');
        });
    });
});

// --- KELOLA ALBUMS ---
app.get('/admin/albums', cekLogin, (req, res) => {
    const sql = `
        SELECT albums.*, units.nama_unit 
        FROM albums 
        JOIN units ON albums.unit_id = units.id 
        ORDER BY albums.tgl_rilis DESC
    `;
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.render('admin/albums', { albums: results });
    });
});

app.get('/admin/albums/add', cekLogin, (req, res) => {
    db.query('SELECT * FROM units', (err, results) => {
        if (err) throw err;
        res.render('admin/album_form', { units: results });
    });
});

app.post('/admin/albums/add', cekLogin, (req, res) => {
    const { unit_id, judul, tgl_rilis, cover } = req.body;
    const sql = 'INSERT INTO albums (unit_id, judul, tgl_rilis, cover) VALUES (?, ?, ?, ?)';
    db.query(sql, [unit_id, judul, tgl_rilis, cover], (err) => {
        if (err) return res.send('Gagal simpan album');
        res.redirect('/admin/albums');
    });
});

app.get('/admin/albums/edit/:id', cekLogin, (req, res) => {
    const albumId = req.params.id;
    db.query('SELECT * FROM albums WHERE id = ?', [albumId], (err, resultAlbum) => {
        if (err) throw err;
        db.query('SELECT * FROM units', (err, resultUnits) => {
            if (err) throw err;
            res.render('admin/album_edit', { album: resultAlbum[0], units: resultUnits });
        });
    });
});

app.post('/admin/albums/update/:id', cekLogin, (req, res) => {
    const { unit_id, judul, tgl_rilis, cover } = req.body;
    const albumId = req.params.id;
    const sql = 'UPDATE albums SET unit_id=?, judul=?, tgl_rilis=?, cover=? WHERE id=?';
    db.query(sql, [unit_id, judul, tgl_rilis, cover, albumId], (err) => {
        if (err) throw err;
        res.redirect('/admin/albums');
    });
});

app.get('/admin/albums/delete/:id', cekLogin, (req, res) => {
    db.query('DELETE FROM songs WHERE album_id = ?', [req.params.id], (err) => {
        db.query('DELETE FROM albums WHERE id = ?', [req.params.id], (err) => {
            if (err) throw err;
            res.redirect('/admin/albums');
        });
    });
});

// --- KELOLA LAGU (SONGS) ---
app.get('/admin/albums/:id/songs', cekLogin, (req, res) => {
    const albumId = req.params.id;
    db.query('SELECT * FROM albums WHERE id = ?', [albumId], (err, resultAlbum) => {
        if (err) throw err;
        db.query('SELECT * FROM songs WHERE album_id = ? ORDER BY id ASC', [albumId], (err, resultSongs) => {
            if (err) throw err;
            res.render('admin/album_songs', { album: resultAlbum[0], songs: resultSongs });
        });
    });
});

app.post('/admin/albums/:id/songs/add', cekLogin, (req, res) => {
    const albumId = req.params.id;
    const { judul_lagu } = req.body;
    db.query('INSERT INTO songs (album_id, judul_lagu) VALUES (?, ?)', [albumId, judul_lagu], (err) => {
        if (err) throw err;
        res.redirect(`/admin/albums/${albumId}/songs`);
    });
});

app.get('/admin/songs/delete/:songId/:albumId', cekLogin, (req, res) => {
    const { songId, albumId } = req.params;
    db.query('DELETE FROM songs WHERE id = ?', [songId], (err) => {
        if (err) throw err;
        res.redirect(`/admin/albums/${albumId}/songs`);
    });
});


// --- KELOLA UNITS ---
app.get('/admin/units', cekLogin, (req, res) => {
    db.query('SELECT * FROM units', (err, results) => {
        if (err) throw err;
        res.render('admin/units', { units: results });
    });
});

app.get('/admin/units/add', cekLogin, (req, res) => {
    res.render('admin/unit_form');
});

app.post('/admin/units/add', cekLogin, (req, res) => {
    const { nama_unit, deskripsi, logo } = req.body;
    db.query('INSERT INTO units (nama_unit, deskripsi, logo) VALUES (?, ?, ?)', 
        [nama_unit, deskripsi, logo], (err) => {
        if (err) throw err;
        res.redirect('/admin/units');
    });
});

app.get('/admin/units/edit/:id', cekLogin, (req, res) => {
    db.query('SELECT * FROM units WHERE id = ?', [req.params.id], (err, result) => {
        if (err) throw err;
        res.render('admin/unit_edit', { unit: result[0] });
    });
});

app.post('/admin/units/update/:id', cekLogin, (req, res) => {
    const { nama_unit, deskripsi, logo } = req.body;
    db.query('UPDATE units SET nama_unit=?, deskripsi=?, logo=? WHERE id=?', 
        [nama_unit, deskripsi, logo, req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/admin/units');
    });
});

app.get('/admin/units/delete/:id', cekLogin, (req, res) => {
    db.query('DELETE FROM units WHERE id = ?', [req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/admin/units');
    });
});

// 6. JALANKAN SERVER

app.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});