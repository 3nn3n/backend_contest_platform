import jwt from 'jsonwebtoken';
import {failure} from '../utils/response.js';

export function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return failure(res, 401, 'Unauthorized');
  }

  const token = header && header.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET;
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return failure(res, 403, 'Unauthorized');
  }

}