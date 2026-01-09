const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const crypto = require('crypto'); 
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
app.use(express.json());
app.use(session({
    secret: 'nct-super-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } 
}));

// ==========================================
// 3. MIDDLEWARE & HELPER
// ==========================================

const isPostman = (req) => {
    const userAgent = req.headers['user-agent'];
    return userAgent && userAgent.includes('Postman');
};

const cekAdmin = (req, res, next) => {
    if (req.session.role === 'admin') next();
    else {
        if (isPostman(req)) return res.status(401).json({ status: "error", message: "Harap LOGIN ADMIN dahulu!" });
        res.redirect('/login');
    }
};

const cekUser = (req, res, next) => {
    if (req.session.role === 'user') next();
    else {
        if (isPostman(req)) return res.status(401).json({ status: "error", message: "Harap LOGIN USER dahulu!" });
        res.redirect('/developer/login');
    }
};

const cekApiKey = (req, res, next) => {
    const key = req.query.key || req.headers['key']; 
    if (!key) return res.status(401).json({ status: "error", message: "API Key diperlukan!" });

    db.query('SELECT * FROM api_keys WHERE key_string = ?', [key], (err, results) => {
        if (err) return res.status(500).json({ status: "error", message: "Database Error" });
        if (results.length === 0) return res.status(403).json({ status: "error", message: "API Key tidak valid." });
        if (results[0].status === 'inactive') return res.status(403).json({ status: "error", message: "API Key ini NON-AKTIF." });
        next(); 
    });
};


// ==========================================
// 4. ROUTE AUTH & PUBLIC
// ==========================================

app.get('/', (req, res) => res.render('index'));

app.get('/developer/register', (req, res) => res.render('user/register'));
app.post('/developer/register', (req, res) => {
    const { email, password, nama_lengkap } = req.body;
    db.query('INSERT INTO api_users (email, password, nama_lengkap) VALUES (?, ?, ?)', [email, password, nama_lengkap], (err) => {
        if(err) return res.send("Email sudah terdaftar.");
        if (isPostman(req)) res.json({ status: "success", message: "Register Berhasil! Silakan login." });
        else res.redirect('/developer/login');
    });
});

app.get('/developer/login', (req, res) => res.render('user/login'));
app.post('/developer/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM api_users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if(results.length > 0) {
            req.session.role = 'user';
            req.session.userId = results[0].id;
            req.session.userName = results[0].nama_lengkap;
            if (isPostman(req)) res.send("LOGIN USER BERHASIL!");
            else res.redirect('/developer/dashboard');
        } else {
            res.send("Login Gagal");
        }
    });
});

app.get('/developer/dashboard', cekUser, (req, res) => {
    db.query('SELECT * FROM api_users WHERE id = ?', [req.session.userId], (err, userRes) => {
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

app.post('/developer/generate-key', cekUser, (req, res) => {
    const newKey = 'nct_' + crypto.randomBytes(16).toString('hex');
    db.query('INSERT INTO api_keys (user_id, key_string, status) VALUES (?, ?, "active")', [req.session.userId, newKey], (err) => {
        if (isPostman(req)) res.json({ status: "success", message: "Key Baru Dibuat!", new_key: newKey });
        else res.redirect('/developer/dashboard');
    });
});

app.get('/developer/logout', (req, res) => {
    req.session.destroy(() => {
        if (isPostman(req)) res.send("LOGOUT USER BERHASIL!");
        else res.redirect('/developer/login');
    });
});


// ==========================================
// 5. API ENDPOINTS (Many-to-Many Logic)
// ==========================================

// Helper query untuk mengambil member + semua unitnya (digabung koma)
const sqlGetMembers = `
    SELECT members.*, GROUP_CONCAT(units.nama_unit SEPARATOR ', ') as unit_names 
    FROM members 
    LEFT JOIN member_units ON members.id = member_units.member_id 
    LEFT JOIN units ON member_units.unit_id = units.id 
    GROUP BY members.id
`;

app.get('/api/v1/members', cekApiKey, (req, res) => {
    db.query(sqlGetMembers, (err, results) => {
        if(err) return res.status(500).json({status: "error", message: "Database Error"});
        res.json({ status: "success", total_data: results.length, data: results });
    });
});

app.get('/api/v1/member/:id', cekApiKey, (req, res) => {
    const sql = sqlGetMembers + " HAVING members.id = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if(results.length === 0) return res.status(404).json({status: "fail", message: "Not Found"});
        res.json({ status: "success", data: results[0] });
    });
});

app.get('/api/v1/download/member/:id', cekApiKey, (req, res) => {
    const sql = sqlGetMembers + " HAVING members.id = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.send("Data not found");
        const m = results[0];
        const content = 
`=======================================
   NCT MEMBER OFFICIAL REPORT
=======================================
ID Member    : ${m.id}
Nama Panggung: ${m.nama_panggung}
Nama Lengkap : ${m.nama_lengkap || '-'}
Unit         : ${m.unit_names || '-'}
Posisi       : ${m.posisi}
Asal Negara  : ${m.asal_negara}
Tanggal Lahir: ${m.tgl_lahir || '-'}

BIOGRAFI SINGKAT:
${m.biografi || 'Tidak ada data biografi.'}
=======================================`;

        res.setHeader('Content-disposition', `attachment; filename=Member_${m.nama_panggung}.txt`);
        res.setHeader('Content-type', 'text/plain');
        res.send(content);
    });
});


// ==========================================
// 6. ROUTE ADMIN (BACKEND UTAMA)
// ==========================================

app.get('/login', (req, res) => {
    if (req.session.role === 'admin') res.redirect('/admin');
    else res.render('login', {error: null});
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM admin WHERE username = ? AND password = ?', [username, password], (err, resDb) => {
        if(resDb.length > 0) {
            req.session.role = 'admin';
            if (isPostman(req)) res.send("LOGIN ADMIN BERHASIL!");
            else res.redirect('/admin');
        } else {
            res.render('login', {error: "Username Salah!"});
        }
    });
});

app.get('/admin', cekAdmin, (req, res) => {
    const sqlCount = `SELECT (SELECT COUNT(*) FROM units) as totalUnits, (SELECT COUNT(*) FROM members) as totalMembers, (SELECT COUNT(*) FROM api_users) as totalUsers`; 
    db.query(sqlCount, (err, results) => {
        if (isPostman(req)) return res.json({ status: "success", stats: results[0] });
        res.render('admin/dashboard', {
            totalUnits: results[0].totalUnits, totalMembers: results[0].totalMembers, totalUsers: results[0].totalUsers, page: 'dashboard' 
        });
    });
});

// --- ADMIN: MEMBERS CRUD (MANY-TO-MANY) ---

app.get('/admin/members', cekAdmin, (req, res) => {
    db.query(sqlGetMembers + " ORDER BY members.id DESC", (err, r) => {
        if (isPostman(req)) return res.json({ status: "success", data: r });
        res.render('admin/members', { members: r, page: 'members' });
    });
});

app.get('/admin/members/add', cekAdmin, (req, res) => {
    db.query('SELECT * FROM units', (err, r) => res.render('admin/member_form', { units: r, page: 'members' }));
});

// ADD MEMBER (SIMPAN BANYAK UNIT) - FIXED VERSION
app.post('/admin/members/add', cekAdmin, (req, res) => {
    console.log("========== ADD MEMBER DEBUG ==========");
    console.log("BODY REQ:", JSON.stringify(req.body, null, 2));
    console.log("======================================");

    const { nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto, units } = req.body;
    
    // 1. Insert Member dulu
    db.query('INSERT INTO members (nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto) VALUES (?, ?, ?, ?, ?, ?, ?)', 
    [nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto], (err, result) => {
        
        if(err) {
            console.error("❌ ERROR SQL MEMBER:", err);
            return res.status(500).json({status: "error", message: "Gagal Insert Member", detail: err.sqlMessage});
        }
        
        console.log("✅ Member ID Baru:", result.insertId);
        const newMemberId = result.insertId;
        
        // 2. Jika ada unit yang dipilih
        if (units && (Array.isArray(units) ? units.length > 0 : units)) {
            const unitArray = Array.isArray(units) ? units : [units];
            
            // ✅ VALIDASI: Cek apakah semua unit_id valid
            const placeholders = unitArray.map(() => '?').join(',');
            db.query(`SELECT id FROM units WHERE id IN (${placeholders})`, unitArray, (errCheck, validUnits) => {
                
                if (errCheck) {
                    console.error("❌ ERROR CEK UNITS:", errCheck);
                    return res.status(500).json({status: "error", message: "Error validasi units"});
                }
                
                // Jika ada unit yang tidak valid
                const validIds = validUnits.map(u => u.id);
                const invalidIds = unitArray.filter(id => !validIds.includes(parseInt(id)));
                
                if (invalidIds.length > 0) {
                    console.error("❌ Unit ID tidak valid:", invalidIds);
                    return res.status(400).json({
                        status: "error", 
                        message: "Member tersimpan tapi unit ID tidak valid!",
                        member_id: newMemberId,
                        invalid_unit_ids: invalidIds,
                        valid_unit_ids: validIds
                    });
                }
                
                // Semua unit valid, insert ke member_units
                const values = validIds.map(uId => [newMemberId, uId]);
                
                db.query('INSERT INTO member_units (member_id, unit_id) VALUES ?', [values], (errUnits) => {
                    if(errUnits) {
                        console.error("❌ ERROR SQL UNITS:", errUnits);
                        return res.status(500).json({
                            status: "error",
                            message: "Member tersimpan tapi gagal tambah unit",
                            detail: errUnits.sqlMessage
                        });
                    }
                    
                    console.log("✅ Units Berhasil Ditambahkan!");
                    if (isPostman(req)) return res.json({ 
                        status: "success", 
                        message: "Member & Units Added",
                        member_id: newMemberId,
                        units_added: validIds
                    });
                    res.redirect('/admin/members');
                });
            });
            
        } else {
            console.log("⚠️  Tidak ada unit yang dipilih");
            if (isPostman(req)) return res.json({ 
                status: "success", 
                message: "Member Added (No Units)",
                member_id: newMemberId 
            });
            res.redirect('/admin/members');
        }
    });
});

// TAMBAHAN PENTING: ROUTE GET MEMBER BY ID (UTK ADMIN POSTMAN)
app.get('/admin/members/:id', cekAdmin, (req, res, next) => {
    // Hindari konflik dengan route lain seperti 'add' atau 'edit'
    // Kita cek apakah :id adalah angka
    if(isNaN(req.params.id)) return next();

    const sql = sqlGetMembers + " HAVING members.id = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if(results.length === 0) return res.status(404).json({status: "fail", message: "Member Not Found"});
        res.json({ status: "success", data: results[0] });
    });
});


app.get('/admin/members/edit/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM members WHERE id=?', [req.params.id], (e, memberRes) => {
        db.query('SELECT unit_id FROM member_units WHERE member_id=?', [req.params.id], (e, selectedUnits) => {
            const currentUnitIds = selectedUnits.map(u => u.unit_id);
            db.query('SELECT * FROM units', (err, allUnits) => {
                 res.render('admin/member_edit', { 
                     member: memberRes[0], 
                     units: allUnits, 
                     currentUnitIds: currentUnitIds, 
                     page: 'members' 
                });
            });
        });
    });
});

// UPDATE MEMBER (RESET UNIT)
app.post('/admin/members/update/:id', cekAdmin, (req, res) => {
    const { nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto, units } = req.body;
    
    db.query('UPDATE members SET nama_panggung=?, nama_lengkap=?, tgl_lahir=?, asal_negara=?, posisi=?, biografi=?, foto=? WHERE id=?', 
    [nama_panggung, nama_lengkap, tgl_lahir, asal_negara, posisi, biografi, foto, req.params.id], () => {
        
        db.query('DELETE FROM member_units WHERE member_id=?', [req.params.id], () => {
            if (units) {
                const unitArray = Array.isArray(units) ? units : [units];
                const values = unitArray.map(uId => [req.params.id, uId]);
                
                db.query('INSERT INTO member_units (member_id, unit_id) VALUES ?', [values], () => {
                    if (isPostman(req)) return res.json({ status: "success", message: "Member Updated" });
                    res.redirect('/admin/members');
                });
            } else {
                if (isPostman(req)) return res.json({ status: "success", message: "Member Updated (No Units)" });
                res.redirect('/admin/members');
            }
        });
    });
});

app.get('/admin/members/delete/:id', cekAdmin, (req, res) => {
    db.query('DELETE FROM members WHERE id=?', [req.params.id], () => {
        if (isPostman(req)) return res.json({ status: "success", message: "Member Deleted" });
        res.redirect('/admin/members');
    });
});


// --- ADMIN: UNITS CRUD ---

app.get('/admin/units', cekAdmin, (req, res) => {
    db.query('SELECT * FROM units', (e, r) => {
        if (isPostman(req)) return res.json({ status: "success", data: r });
        res.render('admin/units', { units: r, page: 'units' });
    });
});

app.get('/admin/units/add', cekAdmin, (req, res) => res.render('admin/unit_form', { page: 'units' }));

app.post('/admin/units/add', cekAdmin, (req, res) => {
    const { nama_unit, deskripsi, logo } = req.body;
    db.query('INSERT INTO units (nama_unit, deskripsi, logo) VALUES (?, ?, ?)', [nama_unit, deskripsi, logo], () => {
        if (isPostman(req)) return res.json({ status: "success", message: "Unit Added" });
        res.redirect('/admin/units');
    });
});

app.get('/admin/units/delete/:id', cekAdmin, (req, res) => {
    db.query('DELETE FROM units WHERE id = ?', [req.params.id], () => {
        if (isPostman(req)) return res.json({ status: "success", message: "Unit Deleted" });
        res.redirect('/admin/units');
    });
});

app.get('/admin/units/edit/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM units WHERE id = ?', [req.params.id], (e, r) => res.render('admin/unit_edit', { unit: r[0], page: 'units' }));
});

app.post('/admin/units/update/:id', cekAdmin, (req, res) => {
    const { nama_unit, deskripsi, logo } = req.body;
    db.query('UPDATE units SET nama_unit=?, deskripsi=?, logo=? WHERE id=?', [nama_unit, deskripsi, logo, req.params.id], () => {
        if (isPostman(req)) return res.json({ status: "success", message: "Unit Updated" });
        res.redirect('/admin/units');
    });
});


// --- ADMIN: USERS & KEYS ---

app.get('/admin/users', cekAdmin, (req, res) => {
    db.query('SELECT * FROM api_users ORDER BY id DESC', (err, results) => {
        if (isPostman(req)) return res.json({ status: "success", data: results });
        res.render('admin/users', { users: results, page: 'users' });
    });
});

app.get('/admin/users/detail/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM api_users WHERE id = ?', [req.params.id], (err, userRes) => {
        db.query('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [req.params.id], (err, keysRes) => {
            if (isPostman(req)) return res.json({ status: "success", user: userRes[0], keys: keysRes });
            res.render('admin/user_detail', { user: userRes[0], keys: keysRes, page: 'users' });
        });
    });
});

app.get('/admin/users/edit/:id', cekAdmin, (req, res) => {
    db.query('SELECT * FROM api_users WHERE id = ?', [req.params.id], (err, r) => res.render('admin/user_edit', { user: r[0], page: 'users' }));
});

app.post('/admin/users/update/:id', cekAdmin, (req, res) => {
    const { nama_lengkap, email, password } = req.body;
    db.query('UPDATE api_users SET nama_lengkap=?, email=?, password=? WHERE id=?', [nama_lengkap, email, password, req.params.id], (err) => {
        if (isPostman(req)) return res.json({ status: "success", message: "User Updated" });
        res.redirect('/admin/users');
    });
});

app.get('/admin/keys/toggle/:keyId/:userId', cekAdmin, (req, res) => {
    db.query('SELECT status FROM api_keys WHERE id = ?', [req.params.keyId], (err, r) => {
        const newStatus = r[0].status === 'active' ? 'inactive' : 'active';
        db.query('UPDATE api_keys SET status = ? WHERE id = ?', [newStatus, req.params.keyId], () => {
            if (isPostman(req)) return res.json({ status: "success", message: "Key Status Changed" });
            res.redirect(`/admin/users/detail/${req.params.userId}`);
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        if (isPostman(req)) res.send("LOGOUT ADMIN BERHASIL!");
        else res.redirect('/login');
    });
});

app.listen(port, () => console.log(`🚀 Server berjalan di http://localhost:${port}`));