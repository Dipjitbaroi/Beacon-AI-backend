import { z } from "zod";

export const loginValidationSchema = z.object({
  body: z.object({
    email: z.string({ required_error: "Email is required" }).email("Invalid email format"),
    password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
  }),
});

export const registerValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }).min(1, "Name is required"),
    email: z.string({ required_error: "Email is required" }).email("Invalid email format"),
    password: z
      .string({ required_error: "Password is required" })
      .min(6, "Password must be at least 6 characters"),
    role: z.enum(["user", "admin"], { required_error: "Role is required" }),
  }),
});
