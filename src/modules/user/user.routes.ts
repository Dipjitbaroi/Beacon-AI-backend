import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { validateRequest } from "../../middlewares/validateRequest";
import { userController } from "./user.controller";
import { listUsersValidationSchema } from "./user.validation";

const router = Router();

router.get(
  "/",
  auth(Role.admin),
  validateRequest(listUsersValidationSchema),
  userController.listUsers,
);

export const userRoutes = router;
