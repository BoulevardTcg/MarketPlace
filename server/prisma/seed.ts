/**
 * Seed: faux items marketplace pour prévisualisation (annonces publiées + images placeholder).
 * À lancer avec: npm run seed (depuis MarketPlace/server).
 * Charge .env automatiquement (DATABASE_URL requis).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// userId réel de l'utilisateur connecté (boutique) — fallback sur un ID de démo
const DEMO_USER_ID = process.env.SEED_USER_ID || "cmk9vvvi80000o82hsoplrots";

/** URLs d’images placeholder pour les cartes (affichées dans la grille) */
const PLACEHOLDER_IMAGES = [
  "https://placehold.co/400x300/1a1a2e/eee?text=Pokemon",
  "https://placehold.co/400x300/2d1b4e/eee?text=Charizard",
  "https://placehold.co/400x300/1b3d4e/eee?text=Pikachu",
  "https://placehold.co/400x300/3d2e1b/eee?text=Magic",
  "https://placehold.co/400x300/2e4d1b/eee?text=Yu-Gi-Oh",
  "https://placehold.co/400x300/4d1b2e/eee?text=One+Piece",
  "https://placehold.co/400x300/1b4d3d/eee?text=Carte",
  "https://placehold.co/400x300/2b1b4d/eee?text=TCG",
];

const DEMO_LISTINGS = [
  {
    title: "Charizard Holo Édition Originale",
    description: "Carte Charizard en excellent état, première édition. Idéal collectionneur.",
    category: "CARD" as const,
    game: "POKEMON" as const,
    language: "FR" as const,
    condition: "NM" as const,
    setCode: "BS-6",
    cardId: "charizard-demo",
    cardName: "Charizard",
    edition: "1ère",
    priceCents: 999,
    imageIndex: 1,
  },
  {
    title: "Pikachu Illustrator (réplique)",
    description: "Réplique fidèle de la carte Pikachu Illustrator pour exposition.",
    category: "CARD" as const,
    game: "POKEMON" as const,
    language: "JP" as const,
    condition: "LP" as const,
    setCode: "PROMO",
    cardName: "Pikachu",
    priceCents: 2499,
    imageIndex: 2,
  },
  {
    title: "Black Lotus (réédition)",
    description: "Réédition Magic The Gathering, Near Mint.",
    category: "CARD" as const,
    game: "MTG" as const,
    language: "EN" as const,
    condition: "NM" as const,
    setCode: "2XM",
    cardName: "Black Lotus",
    priceCents: 89900,
    imageIndex: 3,
  },
  {
    title: "Blue-Eyes White Dragon LART",
    description: "Blue-Eyes White Dragon Limited Edition, français.",
    category: "CARD" as const,
    game: "YUGIOH" as const,
    language: "FR" as const,
    condition: "NM" as const,
    setCode: "LART",
    cardName: "Blue-Eyes White Dragon",
    priceCents: 3499,
    imageIndex: 4,
  },
  {
    title: "Booster One Piece OP-05",
    description: "Booster scellé One Piece OP-05, neuf.",
    category: "SEALED" as const,
    game: "ONE_PIECE" as const,
    language: "FR" as const,
    condition: "NM" as const,
    priceCents: 599,
    imageIndex: 5,
  },
  {
    title: "Dragonite ex",
    description: "Dragonite ex, état correct, léger frottement au dos.",
    category: "CARD" as const,
    game: "POKEMON" as const,
    language: "EN" as const,
    condition: "MP" as const,
    setCode: "EVO",
    cardName: "Dragonite ex",
    priceCents: 1299,
    imageIndex: 6,
  },
  {
    title: "Lorcana – Elsa Reine des Neiges",
    description: "Carte Lorcana Elsa, français, Near Mint.",
    category: "CARD" as const,
    game: "LORCANA" as const,
    language: "FR" as const,
    condition: "NM" as const,
    setCode: "LOR-1",
    cardName: "Elsa",
    priceCents: 899,
    imageIndex: 7,
  },
  {
    title: "Lot 5 cartes Pokémon communes",
    description: "Lot de 5 cartes communes diverses, état correct.",
    category: "CARD" as const,
    game: "POKEMON" as const,
    language: "FR" as const,
    condition: "LP" as const,
    priceCents: 299,
    imageIndex: 0,
  },
];

// ─── Inventaire (UserCollection) avec prix d'acquisition ─────
const DEMO_COLLECTION = [
  { cardId: "charizard-demo",    cardName: "Charizard",           setCode: "BS-6",  game: "POKEMON"  as const, language: "FR" as const, condition: "NM" as const, quantity: 2, acquisitionPriceCents: 750,   acquiredDaysAgo: 60 },
  { cardId: "pikachu-demo",      cardName: "Pikachu Illustrator", setCode: "PROMO", game: "POKEMON"  as const, language: "JP" as const, condition: "LP" as const, quantity: 1, acquisitionPriceCents: 1800,  acquiredDaysAgo: 45 },
  { cardId: "black-lotus-demo",  cardName: "Black Lotus",         setCode: "2XM",   game: "MTG"      as const, language: "EN" as const, condition: "NM" as const, quantity: 1, acquisitionPriceCents: 75000, acquiredDaysAgo: 90 },
  { cardId: "blueyes-demo",      cardName: "Blue-Eyes White Dragon", setCode: "LART", game: "YUGIOH" as const, language: "FR" as const, condition: "NM" as const, quantity: 3, acquisitionPriceCents: 2500,  acquiredDaysAgo: 30 },
  { cardId: "dragonite-demo",    cardName: "Dragonite ex",        setCode: "EVO",   game: "POKEMON"  as const, language: "EN" as const, condition: "MP" as const, quantity: 1, acquisitionPriceCents: 900,   acquiredDaysAgo: 20 },
  { cardId: "elsa-demo",         cardName: "Elsa",                setCode: "LOR-1", game: "LORCANA"  as const, language: "FR" as const, condition: "NM" as const, quantity: 2, acquisitionPriceCents: 600,   acquiredDaysAgo: 15 },
  { cardId: "luffy-demo",        cardName: "Monkey D. Luffy",     setCode: "OP-05", game: "ONE_PIECE" as const, language: "FR" as const, condition: "NM" as const, quantity: 4, acquisitionPriceCents: 350,   acquiredDaysAgo: 10 },
  { cardId: "mewtwo-demo",       cardName: "Mewtwo EX",           setCode: "MEW",   game: "POKEMON"  as const, language: "FR" as const, condition: "NM" as const, quantity: 1, acquisitionPriceCents: 4500,  acquiredDaysAgo: 75 },
  { cardId: "jace-demo",         cardName: "Jace, the Mind Sculptor", setCode: "2XM", game: "MTG"   as const, language: "EN" as const, condition: "LP" as const, quantity: 2, acquisitionPriceCents: 3200,  acquiredDaysAgo: 50 },
  { cardId: "gardevoir-demo",    cardName: "Gardevoir ex",        setCode: "SV4",   game: "POKEMON"  as const, language: "JP" as const, condition: "NM" as const, quantity: 3, acquisitionPriceCents: 1200,  acquiredDaysAgo: 5 },
  { cardId: "goku-demo",         cardName: "Son Goku SSJ",        setCode: "DB-1",  game: "OTHER" as const, language: "FR" as const, condition: "NM" as const, quantity: 2, acquisitionPriceCents: 800,  acquiredDaysAgo: 25 },
  { cardId: "nami-demo",         cardName: "Nami",                setCode: "OP-03", game: "ONE_PIECE" as const, language: "EN" as const, condition: "NM" as const, quantity: 1, acquisitionPriceCents: 500,   acquiredDaysAgo: 35 },
];

// ─── Cotes marché pour chaque carte (ExternalProductRef + CardPriceSnapshot) ──
const DEMO_PRICES: { cardId: string; language: string; game: string; extId: string; trendCents: number; avgCents: number; lowCents: number }[] = [
  { cardId: "charizard-demo",   language: "FR", game: "POKEMON",   extId: "seed-charizard-fr",  trendCents: 1200,  avgCents: 1180, lowCents: 1100 },
  { cardId: "pikachu-demo",     language: "JP", game: "POKEMON",   extId: "seed-pikachu-jp",    trendCents: 2800,  avgCents: 2700, lowCents: 2500 },
  { cardId: "black-lotus-demo", language: "EN", game: "MTG",       extId: "seed-blacklotus-en", trendCents: 95000, avgCents: 92000, lowCents: 88000 },
  { cardId: "blueyes-demo",     language: "FR", game: "YUGIOH",    extId: "seed-blueyes-fr",    trendCents: 3800,  avgCents: 3600, lowCents: 3200 },
  { cardId: "dragonite-demo",   language: "EN", game: "POKEMON",   extId: "seed-dragonite-en",  trendCents: 1500,  avgCents: 1400, lowCents: 1200 },
  { cardId: "elsa-demo",        language: "FR", game: "LORCANA",   extId: "seed-elsa-fr",       trendCents: 950,   avgCents: 900,  lowCents: 800 },
  { cardId: "luffy-demo",       language: "FR", game: "ONE_PIECE", extId: "seed-luffy-fr",      trendCents: 480,   avgCents: 450,  lowCents: 400 },
  { cardId: "mewtwo-demo",      language: "FR", game: "POKEMON",   extId: "seed-mewtwo-fr",     trendCents: 5200,  avgCents: 5000, lowCents: 4800 },
  { cardId: "jace-demo",        language: "EN", game: "MTG",       extId: "seed-jace-en",       trendCents: 4100,  avgCents: 3900, lowCents: 3700 },
  { cardId: "gardevoir-demo",   language: "JP", game: "POKEMON",   extId: "seed-gardevoir-jp",  trendCents: 1800,  avgCents: 1700, lowCents: 1500 },
  { cardId: "goku-demo",        language: "FR", game: "OTHER", extId: "seed-goku-fr",      trendCents: 1100,  avgCents: 1000, lowCents: 900 },
  { cardId: "nami-demo",        language: "EN", game: "ONE_PIECE", extId: "seed-nami-en",       trendCents: 650,   avgCents: 600,  lowCents: 550 },
];

// ─── Annonces vendues (pour graphique ventes) ───────────────
const DEMO_SOLD_LISTINGS = [
  { title: "Salamèche Holo",        game: "POKEMON"  as const, language: "FR" as const, condition: "NM" as const, priceCents: 450,  quantity: 2, soldDaysAgo: 5 },
  { title: "Lot boosters Pokémon",   game: "POKEMON"  as const, language: "FR" as const, condition: "NM" as const, priceCents: 1200, quantity: 3, soldDaysAgo: 12 },
  { title: "Lightning Bolt Foil",    game: "MTG"      as const, language: "EN" as const, condition: "LP" as const, priceCents: 850,  quantity: 1, soldDaysAgo: 18 },
  { title: "Dark Magician LART",     game: "YUGIOH"   as const, language: "FR" as const, condition: "NM" as const, priceCents: 2200, quantity: 1, soldDaysAgo: 25 },
  { title: "Booster OP-03",          game: "ONE_PIECE" as const, language: "FR" as const, condition: "NM" as const, priceCents: 550,  quantity: 5, soldDaysAgo: 35 },
  { title: "Raichu ex",              game: "POKEMON"  as const, language: "JP" as const, condition: "NM" as const, priceCents: 1800, quantity: 1, soldDaysAgo: 42 },
  { title: "Liliana of the Veil",    game: "MTG"      as const, language: "EN" as const, condition: "NM" as const, priceCents: 6500, quantity: 1, soldDaysAgo: 50 },
  { title: "Mickey Mouse Lorcana",   game: "LORCANA"  as const, language: "FR" as const, condition: "LP" as const, priceCents: 700,  quantity: 2, soldDaysAgo: 55 },
  { title: "Vegeta SSJ Blue",        game: "OTHER" as const, language: "FR" as const, condition: "NM" as const, priceCents: 950,  quantity: 1, soldDaysAgo: 60 },
  { title: "Évoli Holo",             game: "POKEMON"  as const, language: "FR" as const, condition: "NM" as const, priceCents: 350,  quantity: 4, soldDaysAgo: 68 },
  { title: "Shanks Leader",          game: "ONE_PIECE" as const, language: "EN" as const, condition: "NM" as const, priceCents: 1500, quantity: 1, soldDaysAgo: 75 },
  { title: "Mewtwo GX",              game: "POKEMON"  as const, language: "FR" as const, condition: "MP" as const, priceCents: 2800, quantity: 1, soldDaysAgo: 80 },
];

async function main() {
  const now = new Date();

  // ─── Nettoyage idempotent ────────────────────────────────
  console.log("Nettoyage des données de démo existantes...");

  await prisma.userPortfolioSnapshot.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.userCollection.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.listingImage.deleteMany({ where: { listing: { userId: DEMO_USER_ID } } });
  await prisma.listing.deleteMany({ where: { userId: DEMO_USER_ID } });

  // Nettoyage des cotes de démo
  const extIds = DEMO_PRICES.map((p) => p.extId);
  await prisma.cardPriceSnapshot.deleteMany({ where: { externalProductId: { in: extIds } } });
  // On ne supprime pas les ExternalProductRef pour éviter les conflits, on fait upsert plus bas

  // ─── 1. Annonces publiées (browse) ──────────────────────
  console.log("Création des annonces publiées...");
  for (let i = 0; i < DEMO_LISTINGS.length; i++) {
    const item = DEMO_LISTINGS[i];
    const listing = await prisma.listing.create({
      data: {
        userId: DEMO_USER_ID,
        title: item.title,
        description: item.description ?? null,
        category: item.category,
        game: item.game,
        language: item.language,
        condition: item.condition,
        setCode: item.setCode ?? null,
        cardId: item.cardId ?? null,
        cardName: item.cardName ?? null,
        edition: item.edition ?? null,
        quantity: item.quantity ?? 1,
        priceCents: item.priceCents,
        currency: "EUR",
        status: "PUBLISHED",
        publishedAt: new Date(now.getTime() - (DEMO_LISTINGS.length - i) * 3600_000),
      },
    });

    const imageUrl = PLACEHOLDER_IMAGES[item.imageIndex ?? 0];
    await prisma.listingImage.create({
      data: {
        listingId: listing.id,
        storageKey: imageUrl,
        sortOrder: 0,
        contentType: "image/png",
      },
    });
  }
  console.log(`  → ${DEMO_LISTINGS.length} annonces publiées.`);

  // ─── 2. Annonces vendues (pour graphiques ventes) ───────
  console.log("Création des annonces vendues...");
  for (const sold of DEMO_SOLD_LISTINGS) {
    const soldAt = new Date(now.getTime() - sold.soldDaysAgo * 86_400_000);
    await prisma.listing.create({
      data: {
        userId: DEMO_USER_ID,
        title: sold.title,
        category: "CARD",
        game: sold.game,
        language: sold.language,
        condition: sold.condition,
        quantity: sold.quantity,
        priceCents: sold.priceCents,
        currency: "EUR",
        status: "SOLD",
        publishedAt: new Date(soldAt.getTime() - 7 * 86_400_000), // publié 7j avant la vente
        soldAt,
      },
    });
  }
  console.log(`  → ${DEMO_SOLD_LISTINGS.length} annonces vendues.`);

  // ─── 3. Collection / Inventaire avec prix d'acquisition ──
  console.log("Création de la collection (inventaire)...");
  for (const item of DEMO_COLLECTION) {
    const acquiredAt = new Date(now.getTime() - item.acquiredDaysAgo * 86_400_000);
    await prisma.userCollection.create({
      data: {
        userId: DEMO_USER_ID,
        cardId: item.cardId,
        cardName: item.cardName,
        setCode: item.setCode,
        game: item.game,
        language: item.language,
        condition: item.condition,
        quantity: item.quantity,
        acquisitionPriceCents: item.acquisitionPriceCents,
        acquisitionCurrency: "EUR",
        acquiredAt,
        isPublic: true,
      },
    });
  }
  console.log(`  → ${DEMO_COLLECTION.length} cartes dans l'inventaire.`);

  // ─── 4. Cotes marché (ExternalProductRef + CardPriceSnapshot) ──
  console.log("Création des cotes marché...");
  for (const price of DEMO_PRICES) {
    await prisma.externalProductRef.upsert({
      where: {
        source_externalProductId: { source: "CARDMARKET", externalProductId: price.extId },
      },
      create: {
        source: "CARDMARKET",
        game: price.game as any,
        cardId: price.cardId,
        language: price.language as any,
        externalProductId: price.extId,
      },
      update: {},
    });

    await prisma.cardPriceSnapshot.create({
      data: {
        source: "CARDMARKET",
        externalProductId: price.extId,
        currency: "EUR",
        trendCents: price.trendCents,
        avgCents: price.avgCents,
        lowCents: price.lowCents,
      },
    });
  }
  console.log(`  → ${DEMO_PRICES.length} cotes marché créées.`);

  // ─── 5. Snapshots de portfolio historiques (pour graphiques d'évolution) ──
  console.log("Création des snapshots portfolio historiques...");

  // Calculer la valeur actuelle du portfolio à partir de la collection + cotes
  const priceMap = new Map(DEMO_PRICES.map((p) => [`${p.cardId}:${p.language}`, p]));
  let currentValueCents = 0;
  let currentCostCents = 0;

  for (const item of DEMO_COLLECTION) {
    const key = `${item.cardId}:${item.language}`;
    const price = priceMap.get(key);
    if (price) {
      currentValueCents += item.quantity * price.trendCents;
    }
    currentCostCents += item.quantity * item.acquisitionPriceCents;
  }

  // Générer 90 jours de snapshots avec une progression réaliste
  // Simuler: la valeur monte progressivement avec des fluctuations, le coût augmente par paliers
  const snapshotCount = 90;
  const snapshots: { totalValueCents: number; totalCostCents: number; pnlCents: number; capturedAt: Date }[] = [];

  for (let day = snapshotCount; day >= 0; day--) {
    const capturedAt = new Date(now.getTime() - day * 86_400_000);
    capturedAt.setHours(12, 0, 0, 0); // midi chaque jour

    // Progression : valeur augmente globalement de ~60% du prix actuel à 100%
    const progress = 1 - (day / snapshotCount);
    const baseValueRatio = 0.6 + progress * 0.4;

    // Fluctuations aléatoires déterministes (basées sur le jour)
    const seed = (day * 7 + 13) % 100;
    const fluctuation = 1 + (seed - 50) / 500; // ±10%

    const valueCents = Math.round(currentValueCents * baseValueRatio * fluctuation);

    // Coût augmente par paliers (on ajoute des cartes au fil du temps)
    const costRatio = Math.min(1, 0.3 + progress * 0.7);
    const costCents = Math.round(currentCostCents * costRatio);

    const pnlCents = valueCents - costCents;

    snapshots.push({ totalValueCents: valueCents, totalCostCents: costCents, pnlCents, capturedAt });
  }

  for (const snap of snapshots) {
    await prisma.userPortfolioSnapshot.create({
      data: {
        userId: DEMO_USER_ID,
        totalValueCents: snap.totalValueCents,
        totalCostCents: snap.totalCostCents,
        pnlCents: snap.pnlCents,
        capturedAt: snap.capturedAt,
      },
    });
  }
  console.log(`  → ${snapshots.length} snapshots portfolio (${snapshotCount} jours).`);

  // ─── Résumé final ───────────────────────────────────────
  console.log("\n=== SEED TERMINÉ ===");
  console.log(`Annonces publiées: ${DEMO_LISTINGS.length}`);
  console.log(`Annonces vendues:  ${DEMO_SOLD_LISTINGS.length}`);
  console.log(`Cartes inventaire: ${DEMO_COLLECTION.length}`);
  console.log(`Cotes marché:      ${DEMO_PRICES.length}`);
  console.log(`Snapshots:         ${snapshots.length}`);
  console.log(`Valeur portfolio:  ${(currentValueCents / 100).toFixed(2)} €`);
  console.log(`Coût acquisition:  ${(currentCostCents / 100).toFixed(2)} €`);
  console.log(`P&L:               ${((currentValueCents - currentCostCents) / 100).toFixed(2)} €`);
  console.log(`userId:            ${DEMO_USER_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
