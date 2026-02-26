import type { PrismaClient, NotificationType } from "@prisma/client";
import { Prisma } from "@prisma/client";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function createNotification(
  db: PrismaClient | TxClient,
  data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    dataJson?: Record<string, unknown>;
  },
): Promise<void> {
  await db.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      dataJson: data.dataJson !== undefined
        ? (data.dataJson as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
