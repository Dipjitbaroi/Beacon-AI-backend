import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

const listUsers = async (filters: { search?: string; role?: "user" | "admin"; page?: number; limit?: number }) => {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;
  const where: Prisma.UserWhereInput = {};
  if (filters.role) where.role = filters.role;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [users, totalUsers, citizenUsers, adminUsers, totalOwnedReports] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { reports: true, progressUpdates: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { role: "user" } }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.report.count({ where: { citizenId: { not: null }, deletedAt: null } }),
  ]);

  return {
    users: users.map(({ _count, ...user }) => ({
      ...user,
      reportCount: _count.reports,
      updateCount: _count.progressUpdates,
    })),
    stats: { totalUsers: citizenUsers + adminUsers, citizenUsers, adminUsers, totalOwnedReports },
    meta: {
      page,
      limit,
      total: totalUsers,
      totalPages: Math.max(1, Math.ceil(totalUsers / limit)),
    },
  };
};

export const userService = { listUsers };
