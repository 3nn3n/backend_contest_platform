import express from "express"
import bcrypt from "bcrypt"
import { failure } from "../utils/response.js";
import { pool } from "../db/index.js";
import { success } from "../utils/response.js";
import jwt from "jsonwebtoken";


const router = express.Router()

router.post("/signup", async (req, res) => {
  try {
    const {name, email, password, role = "contestant"} = req.body;

    if(!name || !email || !password || !role) {
      return failure(res, 400, 'All fields are required');
  }

  if(role !== 'creator' && role !== 'contestant') {
    return failure(res, 400, 'Invalid role specified');
  }

  const existingUser = await pool.query(
    'SELECT * FROM users WHERE email = $1', 
    [email]);

  if(existingUser.rows.length > 0) {
    return failure(res, 409, 'User with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role', 
    [name, email, passwordHash, role]);

  const newUser = result.rows[0];

  return success(res, {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role
  });

  } catch (err) {
    console.error('Signup error:', err);
    return failure(res, 500, 'Internal Server Error');
  }
})

router.post('/signin', async (req, res) => {
  try{
    const {email, password} = req.body;

    if(!email || !password) {
      return failure(res, 400, 'Invalid email or password');
    }

    const userQuery = await pool.query(
      'SELECT * FROM users WHERE email = $1', 
      [email]);

      if(userQuery.rows.length === 0) {
        return failure(res, 401, 'Invalid email or password');
      }

      const user = userQuery.rows[0];

      const validPassword = await bcrypt.compare(password, user.password_hash);

      if(!validPassword) {
        return failure(res, 401, 'Invalid credentials');
      }

      const token = jwt.sign(
        {id: user.id, role: user.role}, 
        process.env.JWT_SECRET, 
        {expiresIn: '1h'});

        return success(res, {token});
  } catch(err) {
    return failure(res, 500, 'Internal Server Error');
  }

})

export default router
