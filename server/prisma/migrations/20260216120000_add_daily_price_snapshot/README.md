# Migration `20260216120000_add_daily_price_snapshot`

Cette migration ajoute **uniquement** la valeur d’enum **TCGDEX** au type `PriceSource`. La table **DailyPriceSnapshot** est créée dans la migration suivante (`20260216120001_daily_price_snapshot_table`).

PostgreSQL exige qu’une nouvelle valeur d’enum soit **commitée** avant d’être utilisée ; on ne peut pas faire `ALTER TYPE ADD VALUE` et `CREATE TABLE ... DEFAULT 'TCGDEX'` dans la même transaction.

## Si la migration est marquée comme « failed » dans la base

1. Marquer cette migration comme « rolled back » (une fois) :

   **Avec Docker :**  
   `docker compose run --rm server npx prisma migrate resolve --rolled-back "20260216120000_add_daily_price_snapshot"`

   **Sans Docker :**  
   `cd server && npx prisma migrate resolve --rolled-back "20260216120000_add_daily_price_snapshot"`

2. Relancer le serveur (ou `docker compose up --build`). Le prochain `migrate deploy` rejouera cette migration puis appliquera `20260216120001_daily_price_snapshot_table`.
