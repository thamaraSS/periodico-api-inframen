const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración del Pool de MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: {
        rejectUnauthorized: false // Permite la conexión SSL con Aiven
    }
});

// Ruta de prueba de noticias
app.get('/api/noticias', async (req, res) => {
    try {
        const { busqueda, categoria } = req.query;
        let sql = 'SELECT * FROM noticias WHERE 1=1';
        const params = [];

        if (categoria && categoria !== 'Todas') {
            sql += ' AND categoria = ?';
            params.push(categoria);
        }

        if (busqueda) {
            sql += ' AND (titulo LIKE ? OR contenido LIKE ?)';
            params.push(`%${busqueda}%`, `%${busqueda}%`);
        }

        sql += ' ORDER BY creado_en DESC';

        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Error SQL:', error);
        res.status(500).json({ mensaje: 'Error al cargar las publicaciones', error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});