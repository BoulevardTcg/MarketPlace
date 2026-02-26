import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient, NotificationType } from "@prisma/client";
import { createNotification } from "../shared/notifications/createNotification.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

interface Log {
  info(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface AlertCheckResult {
  triggered: number;
  skipped: number;
  noData: number;
  total: number;
}

const defaultLog: Log = {
  info: (msg, meta) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: "error", msg, ...meta })),
};

let isRunning = false;

export async function runCheckPriceAlerts(log: Log | null = null): Promise<AlertCheckResult> {
  if (isRunning) {
    (log ?? defaultLog).info("checkPriceAlerts already running, skipping");
    return { triggered: 0, skipped: 0, noData: 0, total: 0 };
  }
  isRunning = true;
  const logger = log ?? defaultLog;

  const result: AlertCheckResult = { triggered: 0, skipped: 0, noData: 0, total: 0 };

  try {
    // Load all active alerts
    const alerts = await prisma.priceAlert.findMany({
      where: { active: true },
    });

    result.total = alerts.length;
    logger.info("checkPriceAlerts started", { total: alerts.length });

    if (alerts.length === 0) return result;

    // Batch: group by (cardId, language) to minimize DB queries
    const pairs = new Map<string, { cardId: string; language: string }>();
    for (const alert of alerts) {
      const key = `${alert.cardId}:${alert.language}`;
      if (!pairs.has(key)) pairs.set(key, { cardId: alert.cardId, language: alert.language });
    }

    // Fetch latest DailyPriceSnapshot for each distinct (cardId, language) pair
    const snapshots = await Promise.all(
      [...pairs.values()].map(({ cardId, language }) =>
        prisma.dailyPriceSnapshot.findFirst({
          where: { cardId, language: language as never, source: "TCGDEX" },
          orderBy: { day: "desc" },
          select: { cardId: true, language: true, trendCents: true, day: true },
        }),
      ),
    );

    // Map (cardId:language) → snapshot
    const snapshotByKey = new Map<string, { trendCents: number; day: Date }>();
    for (const snap of snapshots) {
      if (snap) {
        snapshotByKey.set(`${snap.cardId}:${snap.language}`, {
          trendCents: snap.trendCents,
          day: snap.day,
        });
      }
    }

    // Check each alert
    for (const alert of alerts) {
      const key = `${alert.cardId}:${alert.language}`;
      const snap = snapshotByKey.get(key);

      if (!snap) {
        result.noData++;
        continue;
      }

      const isTriggered =
        alert.direction === "DROP"
          ? snap.trendCents <= alert.thresholdCents
          : snap.trendCents >= alert.thresholdCents;

      if (!isTriggered) {
        result.skipped++;
        continue;
      }

      // Mark alert as triggered and deactivate it
      await prisma.priceAlert.update({
        where: { id: alert.id },
        data: {
          active: false,
          triggeredAt: new Date(),
        },
      });

      // Send notification
      const direction = alert.direction === "DROP" ? "baissé" : "monté";
      const priceEuros = (snap.trendCents / 100).toFixed(2);
      const thresholdEuros = (alert.thresholdCents / 100).toFixed(2);

      await createNotification(prisma, {
        userId: alert.userId,
        type: NotificationType.PRICE_ALERT_TRIGGERED,
        title: "Alerte de prix déclenchée",
        body: `La carte ${alert.cardId} (${alert.language}) a ${direction} à ${priceEuros}€ (seuil : ${thresholdEuros}€).`,
        dataJson: {
          alertId: alert.id,
          cardId: alert.cardId,
          language: alert.language,
          direction: alert.direction,
          trendCents: snap.trendCents,
          thresholdCents: alert.thresholdCents,
          day: snap.day.toISOString(),
        },
      });

      result.triggered++;
      logger.info("Alert triggered", {
        alertId: alert.id,
        cardId: alert.cardId,
        language: alert.language,
        direction: alert.direction,
        trendCents: snap.trendCents,
        thresholdCents: alert.thresholdCents,
      });
    }

    logger.info("checkPriceAlerts completed", {
      triggered: result.triggered,
      skipped: result.skipped,
      noData: result.noData,
      total: result.total,
    });
  } catch (e) {
    logger.error("checkPriceAlerts failed", { error: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    isRunning = false;
  }

  return result;
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCheckPriceAlerts(null)
    .then((r) => {
      console.log("Done", r);
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error(e);
      return prisma.$disconnect().finally(() => process.exit(1));
    });
}
