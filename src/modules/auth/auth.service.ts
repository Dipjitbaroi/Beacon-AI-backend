import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { jwtUtils } from "../../utils/jwt";
import { ILoginUser, IRegisterUser } from "./auth.interface";

const registerUser = async (payload: IRegisterUser) => {
  const { name, email, password } = payload;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "User already exists with this email"
    );
  }

  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds) || 12,
  );

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "user",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return user;
};

const loginUser = async (payload: ILoginUser) => {
  const { email, password } = payload;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  const isPasswordMatched = await bcrypt.compare(password, user.password);

  if (!isPasswordMatched) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  const jwtPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in,
  );

  return {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
};

export const authService = {
  registerUser,
  loginUser,
};
