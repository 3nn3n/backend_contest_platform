import { failure } from "../utils/response"

export function authorizeRoles(role) {
  return (req, res, next) => {
    if(req.user.role !== role) {
      return failure(res, 403, 'Forbidden');
    }
    next();
  }
}