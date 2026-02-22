/**
 * Job "snapshot-all-cards" :
 * - liste toutes les cartes via TCGdex /cards paginé
 * - récupère le détail par carte/langue
 * - normalise et upsert dans DailyPriceSnapshot
 * - reprenable via JobCursor
 */
import "dotenv/config";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { prisma } from "../src/shared/db/prisma.js";
import { normalizeTcgdexPricing } from "../src/shared/pricing/normalizeTcgdexPricing.js";
import { upsertTcgdexSnapshots } from "../src/shared/pricing/snapshotTcgdexPricing.js";
import type { NormalizedTcgdexPricing } from "../src/shared/pricing/normalizeTcgdexPricing.js";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const JOB_ID = "tcgdex-snapshot-all";
const TCGDEX_BASE = process.env.TCGDEX_BASE ?? "https://api.tcgdex.net/v2";

const LANGS = (process.env.TCGDEX_LANGS ?? "fr")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ITEMS_PER_PAGE = Math.min(
  100,
  Math.max(10, Number(process.env.TCGDEX_ITEMS_PER_PAGE ?? "100")),
);

const CONCURRENCY = Math.min(
  10,
  Math.max(1, Number(process.env.TCGDEX_CONCURRENCY ?? "4")),
);

const MIN_DELAY_MS = Number(process.env.TCGDEX_MIN_DELAY_MS ?? "120");
const MAX_RETRIES = Number(process.env.TCGDEX_MAX_RETRIES ?? "6");

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchJsonWithRetry(url: string): Promise<any> {
  let attempt = 0;

  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 30_000);

    try {
      const res = await fetch(url, { signal: ctrl.signal });

      if (res.status === 429) {
        clearTimeout(timeout);

        const retryAfter = res.headers.get("retry-after");
        let waitMs = 2_000;

        if (retryAfter) {
          const asNum = Number(retryAfter);
          if (!Number.isNaN(asNum)) waitMs = asNum * 1000;
          else {
            const asDate = Date.parse(retryAfter);
            if (!Number.isNaN(asDate)) waitMs = Math.max(0, asDate - Date.now());
          }
        } else {
          waitMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempt, 6));
        }

        await sleep(waitMs);
        if (attempt <= MAX_RETRIES) continue;
        throw new Error(`HTTP 429 after ${MAX_RETRIES} retries for ${url}`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        clearTimeout(timeout);
        throw new Error(`HTTP ${res.status} for ${url} :: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      clearTimeout(timeout);
      return data;
    } catch (e) {
      clearTimeout(timeout);
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(Math.min(30_000, 500 * 2 ** attempt));
    }
  }
}

async function mapPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

async function loadCursor(): Promise<{ page: number; langIndex: number }> {
  const row = await prisma.jobCursor.findUnique({ where: { jobId: JOB_ID } });
  if (!row) return { page: 1, langIndex: 0 };
  return { page: row.cursorPage, langIndex: row.cursorLang };
}

async function saveCursor(page: number, langIndex: number): Promise<void> {
  await prisma.jobCursor.upsert({
    where: { jobId: JOB_ID },
    create: { jobId: JOB_ID, cursorPage: page, cursorLang: langIndex },
    update: { cursorPage: page, cursorLang: langIndex },
  });
}

function hasSources(marketPricing: NormalizedTcgdexPricing | null): boolean {
  if (!marketPricing || typeof marketPricing !== "object") return false;
  return "trendCents" in marketPricing && marketPricing.trendCents != null;
}

async function processCard(cardId: string, lang: string): Promise<void> {
  const url = `${TCGDEX_BASE}/${encodeURIComponent(lang)}/cards/${encodeURIComponent(cardId)}`;

  try {
    const cardDetail = await fetchJsonWithRetry(url);

    const marketPricing = normalizeTcgdexPricing(cardDetail);

    if (!hasSources(marketPricing)) return;

    await upsertTcgdexSnapshots(cardId, lang, marketPricing!);
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes("HTTP 404")) return;
    throw e;
  } finally {
    await sleep(MIN_DELAY_MS);
  }
}

async function main(): Promise<void> {
  const cursor = await loadCursor();

  const forcedStartPage = Number(process.env.TCGDEX_START_PAGE ?? "");
  let page =
    Number.isFinite(forcedStartPage) && forcedStartPage > 0 ? forcedStartPage : cursor.page;

  let startLangIndex = cursor.langIndex;
  let totalProcessed = 0;

  while (true) {
    const listUrl =
      `${TCGDEX_BASE}/en/cards?sort:field=id&sort:order=ASC` +
      `&pagination:page=${page}&pagination:itemsPerPage=${ITEMS_PER_PAGE}`;

    const raw = await fetchJsonWithRetry(listUrl);
    const cardBriefs = Array.isArray(raw) ? raw : [];

    const ids = cardBriefs
      .map((c: { id?: string }) => c.id)
      .filter(Boolean) as string[];

    if (ids.length === 0) break;

    for (let li = startLangIndex; li < LANGS.length; li++) {
      const lang = LANGS[li]!;
      await mapPool(ids, (cardId) => processCard(cardId, lang), CONCURRENCY);

      totalProcessed += ids.length;
      await saveCursor(page, li + 1);
    }

    await saveCursor(page + 1, 0);
    startLangIndex = 0;
    page++;

    if (cardBriefs.length < ITEMS_PER_PAGE) break;
  }

  console.log(`✅ ${JOB_ID} terminé. ~${totalProcessed} snapshots (multiplié par langues).`);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌", e);
    await prisma.$disconnect();
    process.exit(1);
  });
