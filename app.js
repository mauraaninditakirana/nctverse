const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const crypto = require('crypto'); // Library bawaan Node.js
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
// 2. CONFIG SERVER & SESSION
// ==========================================
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'nct-super-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 Jam
}));

// ==========================================
// 3. MIDDLEWARE & HELPER (LOGIKA BARU)
// ==========================================

// Fungsi Helper: Deteksi apakah request dari Postman?
const isPostman = (req) => {
    const userAgent = req.headers['user-agent'];
    // Cek apakah User-Agent mengandung kata "Postman"
    return userAgent && userAgent.includes('Postman');
};

// Cek Admin
const cekAdmin = (req, res, next) => {
    if (req.session.role === 'admin') next();
    else res.redirect('/login');
};

// Cek User Developer
const cekUser = (req, res, next) => {
    if (req.session.role === 'user') next();
    else res.redirect('/developer/login');
};

// Cek API Key (Support URL & HEADER Postman)
const cekApiKey = (req, res, next) => {
    const key = req.query.key || req.headers['key']; 

    if (!key) return res.status(401).json({ status: "error", message: "API Key diperlukan!" });

    db.query('SELECT * FROM api_keys WHERE key_string = ?', [key], (err, results) => {
        if (err) return res.status(500).json({ status: "error", message: "Database Error" });
        
        if (results.length === 0) return res.status(403).json({ status: "error", message: "API Key tidak valid." });
        
        if (results[0].status === 'inactive') return res.status(403).json({ status: "error", message: "API Key ini telah DINONAKTIFKAN oleh Admin." });

        next(); 
    });
};


// ==========================================
// 4. ROUTE PUBLIC & AUTH (HYBRID)
// ==========================================

app.get('/', (req, res) => res.render('index'));

// --- Register Developer ---
app.get('/developer/register', (req, res) => res.render('user/register'));

app.post('/developer/register', (req, res) => {
    const { email, password, nama_lengkap } = req.body;
    
    db.query('INSERT INTO api_users (email, password, nama_lengkap) VALUES (?, ?, ?)', 
    [email, password, nama_lengkap], (err) => {
        if(err) return res.send("Email error/sudah terdaftar.");
        
        // --- LOGIKA CERDAS ---
        if (isPostman(req)) {
            res.json({
                status: "success",
                message: "HORE! User berhasil terdaftar. Silakan login."
            });
        } else {
            res.redirect('/developer/login');
        }
    });
});

// --- Login Developer ---
app.get('/developer/login', (req, res) => res.render('user/login'));

app.post('/developer/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM api_users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if(results.length > 0) {
            req.session.role = 'user';
            req.session.userId = results[0].id;
            req.session.userName = results[0].nama_lengkap;
            
            // --- LOGIKA CERDAS ---
            if (isPostman(req)) {
                res.send("LOGIN DEVELOPER BERHASIL! Silakan akses dashboard atau endpoint lainnya.");
            } else {
                res.redirect('/developer/dashboard');
            }
            
        } else {
            res.send("Login Gagal: Email atau Password Salah");
        }
    });
});

// --- Dashboard Developer ---
app.get('/developer/dashboard', cekUser, (req, res) => {
    db.query('SELECT * FROM api_users WHERE id = ?', [req.session.userId], (err, userRes) => {
        if(userRes.length === 0) return res.redirect('/developer/login');

        db.query('SELECT * FROM api_keys WHERE user_id = ? ORDER BY id DESC LIMIT 1', [req.session.userId], (err, keyRes) => {
            const userData = userRes[0];
            if (keyRes.length > 0) {
                userData.api_key = keyRes[0].key_string;
                userData.status = keyRes[0].status;
            } else {
                userData.api_key = null;
                userData.status = 'active';
            }
            res.render('user/dashboard', { user: userData });
        });
    });
});

// --- Generate Key (HYBRID) ---
app.post('/developer/generate-key', cekUser, (req, res) => {
    const newKey = 'nct_' + crypto.randomBytes(16).toString('hex');
    
    db.query('INSERT INTO api_keys (user_id, key_string, status) VALUES (?, ?, "active")', 
    [req.session.userId, newKey], (err) => {
        if(err) {
            console.log(err);
            return res.send("Database Error");
        }
        
        // --- LOGIKA CERDAS ---
        if (isPostman(req)) {
            res.json({
                status: "success",
                message: "API Key Baru Berhasil Dibuat!",
                new_key: newKey
            });
        } else {
            res.redirect('/developer/dashboard');
        }
    });
});

// Logout Developer (Hybrid)
app.get('/developer/logout', (req, res) => {
    req.session.destroy((err) => {
        if(err) return res.send("Gagal Logout");

        if (isPostman(req)) {
            res.send("LOGOUT DEVELOPER BERHASIL! Sesi Anda telah dihapus.");
        } else {
            res.redirect('/developer/login');
        }
    });
});


// ==========================================
// 5. API ENDPOINTS (DATA PROVIDER)
// ==========================================

app.get('/api/v1/members', cekApiKey, (req, res) => {
    db.query('SELECT * FROM members', (err, results) => {
        res.json({
            status: "success",
            total_data: results.length,
            data: results
        });
    });
});

app.get('/api/v1/member/:id', cekApiKey, (req, res) => {
    db.query('SELECT * FROM members WHERE id = ?', [req.params.id], (err, results) => {
        if(results.length === 0) return res.status(404).json({status: "fail", message: "Not Found"});
        res.json({ status: "success", data: results[0] });
    });
});

app.get('/api/v1/download/member/:id', cekApiKey, (req, res) => {
    const id = req.params.id;
    db.query('SELECT * FROM members WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) return res.send("Data not found");
        
        const m = results[0];
        const content = 
`=======================================
   NCT MEMBER OFFICIAL REPORT
=======================================
ID Member    : ${m.id}
Nama Panggung: ${m.nama_panggung}
Nama Lengkap : ${m.nama_lengkap || '-'}
Posisi       : ${m.posisi}
Asal Negara  : ${m.asal_negara}
Tanggal Lahir: ${m.tgl_lahir || '-'}

BIOGRAFI SINGKAT:
${m.biografi || 'Tidak ada data biografi.'}

=======================================
Generated by NCT API Center
=======================================`;

        res.setHeader('Content-disposition', `attachment; filename=Member_${m.nama_panggung}.txt`);
        res.setHeader('Content-type', 'text/plain');
        res.send(content);
    });
});


// ==========================================
// 6. ROUTE ADMIN (BACKEND UTAMA)
// ==========================================

// Login Admin
app.get('/login', (req, res) => {
    if (req.session.role === 'admin') res.redirect('/admin');
    else res.render('login', {error: null});
});

// --- UPDATE PENTING: LOGIN ADMIN JADI HYBRID ---
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM admin WHERE username = ? AND password = ?', [username, password], (err, resDb) => {
        if(resDb.length > 0) {
            req.session.role = 'admin';
            
            // --- LOGIKA CERDAS ---
            if (isPostman(req)) {
                // Postman: Kasih Teks
                res.send("LOGIN ADMIN BERHASIL! Silakan kelola data.");
            } else {
                // Browser: Pindah ke Dashboard
                res.redirect('/admin');
            }

        } else {
            res.render('login', {error: "Username atau Password Salah!"});
        }
    });
});

// --- DASHBOARD ADMIN ---
app.get('/admin', cekAdmin, (req, res) => {
    const sqlCount = `SELECT 
        (SELECT COUNT(*) FROM units) as totalUnits, 
        (SELECT COUNT(*) FROM members) as totalMembers, 
        (SELECT COUNT(*) FROM api_users) as totalUsers`; 

    db.query(sqlCount, (err, results) => {
        if(err) throw err;
        res.render('admin/dashboard', {
            totalUnits: results[0].totalUnits,
            totalMembers: results[0].totalMembers,
            totalUsers: results[0].totalUsers,
            page: 'dashboard' 
        });
    });
});

// ==========================================
// FITUR: MANAJEMEN USER API (CRUD & HISTORY)
// ==========================================

app.get('/admin/users', cekAdmin, (req, res) => {
    db.query('SELECT * FROM api_users ORDER BY id DESC', (err, results) => {
        res.render('admin/users', { users: results, page: 'users' });
    });
});

app.get('/admin/users/detail/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM api_users WHERE id = ?', [req.params.id], (err, userRes) => {
        db.query('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [req.params.id], (err, keysRes) => {
            res.render('admin/user_detail', { user: userRes[0], keys: keysRes, page: 'users' });
        });
    });
});

app.get('/admin/users/edit/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM api_users WHERE id = ?', [req.params.id], (err, r) => {
        res.render('admin/user_edit', { user: r[0], page: 'users' });
    });
});

app.post('/admin/users/update/:id', cekAdmin, (req, res) => {
    const { nama_lengkap, email, password } = req.body;
    db.query('UPDATE api_users SET nama_lengkap=?, email=?, password=? WHERE id=?', 
    [nama_lengkap, email, password, req.params.id], (err) => {
        res.redirect('/admin/users');
    });
});

app.get('/admin/keys/toggle/:keyId/:userId', cekAdmin, (req, res) => {
    db.query('SELECT status FROM api_keys WHERE id = ?', [req.params.keyId], (err, r) => {
        const currentStatus = r[0].status;
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        db.query('UPDATE api_keys SET status = ? WHERE id = ?', [newStatus, req.params.keyId], () => {
            res.redirect(`/admin/users/detail/${req.params.userId}`);
        });
    });
});


// ==========================================
// FITUR: CRUD MEMBERS & UNITS
// ==========================================

app.get('/admin/members', cekAdmin, (req, res) => {
    db.query('SELECT * FROM members ORDER BY id DESC', (err, r) => {
        res.render('admin/members', { members: r, page: 'members' });
    });
});

app.get('/admin/members/add', cekAdmin, (req, res) => {
    db.query('SELECT * FROM units', (err, r) => {
        res.render('admin/member_form', { units: r, page: 'members' });
    });
});

app.post('/admin/members/add', cekAdmin, (req, res) => {
    const { nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto } = req.body;
    db.query('INSERT INTO members (nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto) VALUES (?, ?, ?, ?, ?, ?, ?)', 
    [nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto], () => {
        res.redirect('/admin/members');
    });
});

app.get('/admin/members/edit/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM members WHERE id=?', [req.params.id], (e, r) => {
        db.query('SELECT * FROM units', (err, u) => {
             res.render('admin/member_edit', { member: r[0], units: u, currentUnitIds: [], page: 'members' });
        });
    });
});

app.post('/admin/members/update/:id', cekAdmin, (req, res) => {
    const { nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto } = req.body;
    db.query('UPDATE members SET nama_panggung=?, nama_lengkap=?, tgl_lahir=?, asal_negara=?, posisi=?, biografi=?, foto=? WHERE id=?', 
    [nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto, req.params.id], () => {
        res.redirect('/admin/members');
    });
});

app.get('/admin/members/delete/:id', cekAdmin, (req, res) => {
    db.query('DELETE FROM members WHERE id=?', [req.params.id], () => {
        res.redirect('/admin/members');
    });
});

app.get('/admin/units', cekAdmin, (req, res) => {
    db.query('SELECT * FROM units', (e, r) => {
        res.render('admin/units', { units: r, page: 'units' });
    });
});

app.get('/admin/units/add', cekAdmin, (req, res) => {
    res.render('admin/unit_form', { page: 'units' });
});

app.post('/admin/units/add', cekAdmin, (req, res) => {
    const { nama_unit, deskripsi, logo } = req.body;
    db.query('INSERT INTO units (nama_unit, deskripsi, logo) VALUES (?, ?, ?)', 
    [nama_unit, deskripsi, logo], () => {
        res.redirect('/admin/units');
    });
});

app.get('/admin/units/delete/:id', cekAdmin, (req, res) => {
    db.query('DELETE FROM units WHERE id = ?', [req.params.id], () => {
        res.redirect('/admin/units');
    });
});

app.get('/admin/units/edit/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM units WHERE id = ?', [req.params.id], (e, r) => {
        res.render('admin/unit_edit', { unit: r[0], page: 'units' });
    });
});

app.post('/admin/units/update/:id', cekAdmin, (req, res) => {
    const { nama_unit, deskripsi, logo } = req.body;
    db.query('UPDATE units SET nama_unit=?, deskripsi=?, logo=? WHERE id=?', 
    [nama_unit, deskripsi, logo, req.params.id], () => {
        res.redirect('/admin/units');
    });
});

// Logout Umum (Hybrid)
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        if (isPostman(req)) {
            res.send("LOGOUT ADMIN/USER BERHASIL!");
        } else {
            res.redirect('/login');
        }
    });
});

// Jalankan Server
app.listen(port, () => {
    console.log(`🚀 Server berjalan di http://localhost:${port}`);
});