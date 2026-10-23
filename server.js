const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'secret_key_kuromi';

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de almacenamiento para archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Configuración MySQL
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'periodico_escolar'
};

// Middleware JWT
const verificarToken = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) return res.status(403).json({ mensaje: 'Token requerido' });

    const token = tokenHeader.split(' ')[1];
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ mensaje: 'Token inválido o expirado' });
        req.usuario = decoded;
        next();
    });
};

// Autenticación - Login
app.post('/api/auth/login', async (req, res) => {
    const { correo, password } = req.body;
    let connection;

    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        await connection.end();

        if (rows.length === 0) return res.status(400).json({ mensaje: 'El correo electrónico no está registrado' });

        const usuario = rows[0];
        const passValida = await bcrypt.compare(password, usuario.password);
        if (!passValida) return res.status(400).json({ mensaje: 'Contraseña incorrecta' });

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
            SECRET_KEY,
            { expiresIn: '8h' }
        );

        res.json({
            mensaje: 'Inicio de sesión exitoso',
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }
        });

    } catch (err) {
        if (connection) await connection.end();
        res.status(500).json({ mensaje: 'Error interno en el servidor: ' + err.message });
    }
});

// Noticias - Obtener
app.get('/api/noticias', async (req, res) => {
    const { busqueda, categoria } = req.query;
    let connection;

    try {
        connection = await mysql.createConnection(dbConfig);
        let query = `
            SELECT n.*, u.nombre AS autor 
            FROM noticias n 
            LEFT JOIN usuarios u ON n.autor_id = u.id 
            WHERE 1=1
        `;
        const params = [];

        if (categoria && categoria !== 'Todas') {
            query += ' AND n.categoria = ?';
            params.push(categoria);
        }

        if (busqueda) {
            query += ' AND (n.titulo LIKE ? OR n.contenido LIKE ?)';
            params.push(`%${busqueda}%`, `%${busqueda}%`);
        }

        query += ' ORDER BY n.fecha_creacion DESC';

        const [rows] = await connection.execute(query, params);
        await connection.end();

        res.json(rows);

    } catch (err) {
        if (connection) await connection.end();
        res.status(500).json({ mensaje: 'Error al cargar las publicaciones' });
    }
});

// Noticias - Crear
app.post('/api/noticias', verificarToken, upload.single('archivo'), async (req, res) => {
    if (req.usuario.rol !== 'admin') {
        return res.status(403).json({ mensaje: 'Sin permisos de administrador' });
    }

    const { titulo, categoria, contenido } = req.body;
    let media_url = null;
    let media_tipo = 'ninguno';

    if (req.file) {
        media_url = `/uploads/${req.file.filename}`;
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) media_tipo = 'imagen';
        else if (['.mp4', '.webm', '.ogg', '.mov'].includes(ext)) media_tipo = 'video';
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO noticias (titulo, categoria, contenido, media_url, media_tipo, autor_id) VALUES (?, ?, ?, ?, ?, ?)',
            [titulo, categoria, contenido, media_url, media_tipo, req.usuario.id]
        );
        await connection.end();

        res.status(201).json({ mensaje: 'Publicación creada exitosamente' });

    } catch (err) {
        if (connection) await connection.end();
        res.status(500).json({ mensaje: 'Error al guardar la noticia: ' + err.message });
    }
});

// Noticias - Eliminar
app.delete('/api/noticias/:id', verificarToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') {
        return res.status(403).json({ mensaje: 'Sin permisos de administrador' });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM noticias WHERE id = ?', [req.params.id]);
        await connection.end();

        res.json({ mensaje: 'Publicación eliminada correctamente' });

    } catch (err) {
        if (connection) await connection.end();
        res.status(500).json({ mensaje: 'Error al eliminar la publicación' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor API corriendo en http://localhost:${PORT}`);
});

const API = 'http://localhost/periodico_app/index.php';