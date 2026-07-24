import { z } from "zod";

export const listUsersValidationSchema = z.object({
  query: z.object({
    search: z.string().trim().max(100).optional(),
    role: z.enum(["user", "admin"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
});
