import { z } from "zod";

export const loginValidationSchema = z.object({
  body: z.object({
    email: z.string({ required_error: "Email is required" }).trim().toLowerCase().email("Invalid email format"),
    password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
  }),
});

export const registerValidationSchema = z.object({
  body: z.object({
    name: z.string({ required_error: "Name is required" }).trim().min(2, "Name must be at least 2 characters").max(80),
    email: z.string({ required_error: "Email is required" }).trim().toLowerCase().email("Invalid email format"),
    password: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Za-z]/, "Password must include a letter")
      .regex(/\d/, "Password must include a number"),
  }),
});
