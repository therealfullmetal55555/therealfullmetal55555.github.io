require('dotenv').config();
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function setupDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            chat_id INTEGER PRIMARY KEY,
            user_name TEXT,
            main_goal TEXT,
            fatigue_level TEXT,
            activity TEXT,
            digestion TEXT,
            beauty_focus TEXT,
            current_focus TEXT,
            preferred_format TEXT,
            contact_type TEXT,
            contact_data TEXT,
            step TEXT,
            completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    return db;
}

module.exports = { setupDb };
