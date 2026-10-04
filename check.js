const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();
async function main() {
    const pool = mysql.createPool({
        uri: process.env.TIDB_URL,
        ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
    });
    try {
        await pool.query('CREATE DATABASE IF NOT EXISTS task_tracker');
        console.log("Database task_tracker created");
    } catch(e) {
        console.log("Error creating DB:", e.message);
    }
    process.exit(0);
}
main();
