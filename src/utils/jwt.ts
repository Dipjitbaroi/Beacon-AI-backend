import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

const createToken = (payload: JwtPayload, secret: string, expiresIn: string) => {
  return jwt.sign(payload, secret, { expiresIn } as SignOptions);
};

const verifyToken = (token: string, secret: string) => {
  try {
    const decoded = jwt.verify(token, secret);
    return { success: true as const, data: decoded };
  } catch (error: any) {
    return { success: false as const, error: error.message as string };
  }
};

export const jwtUtils = {
  createToken,
  verifyToken,
};
