import config from "../../config";
import { jwtUtils } from "../../utils/jwt";

export const getAdminToken = () => {
  return jwtUtils.createToken(
    {
      id: "test-admin-id",
      name: "Test Admin",
      email: "admin@test.com",
      role: "admin",
    },
    config.jwt_access_secret,
    config.jwt_access_expires_in,
  );
};

export const getUserToken = () => {
  return jwtUtils.createToken(
    {
      id: "test-user-id",
      name: "Test User",
      email: "user@test.com",
      role: "user",
    },
    config.jwt_access_secret,
    config.jwt_access_expires_in,
  );
};
