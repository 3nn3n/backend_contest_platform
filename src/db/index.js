import pkg from "pg"
import path from "path"
import fs from "fs"
const {Pool} = pkg

export const pool = new Pool({
  host: "localhost",
  database: "contest_platform",
  user: "postgres",
  password: "retypepassword",
  port: 5432,
});

pool.on("connect", () => {
  console.log("Connected to the database")
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err)
  process.exit(-1)
})// Test the connection
pool.query("SELECT NOW()")
  .then(() => console.log("Database connection successful"))
  .catch(err => console.error("Database connection error:", err.message))



export async function initializeDatabase() {
  try {
    const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);
    console.log('Database schema initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err.message);
    throw err;
  }
}