import { beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});
