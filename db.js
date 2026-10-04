const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

let pool;

async function initDB() {
  if (!process.env.TIDB_URL) {
    console.warn("TIDB_URL environment variable is missing. Please set it in .env file.");
  }
  
  pool = mysql.createPool({
    uri: process.env.TIDB_URL || 'mysql://root@localhost:4000/test',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    }
  });

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(80),
      email VARCHAR(255) UNIQUE,
      passwordHash VARCHAR(255),
      avatarPath VARCHAR(255),
      createdAt VARCHAR(30),
      updatedAt VARCHAR(30)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      hash VARCHAR(64) PRIMARY KEY,
      userId VARCHAR(36),
      createdAt BIGINT,
      expiresAt BIGINT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      userId VARCHAR(36) PRIMARY KEY,
      tasks JSON,
      folders JSON,
      history JSON,
      groupMembers JSON,
      rewards JSON
    )
  `);

  console.log("TiDB tables initialized.");
}

function getPool() {
  if (!pool) throw new Error("Database not initialized");
  return pool;
}

module.exports = { initDB, getPool };
