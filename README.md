# FoodTracker – Osobní sledování kalorického příjmu, výdeje a maker

Mobilní webová aplikace (PWA) postavená v **Next.js 15 (TypeScript + Tailwind CSS)** s cloudovou databází **Supabase (`PostgreSQL` + `pgvector` + `Realtime`)** a asynchronními AI agenty na modelech **Google Gemini (`gemini-3.8-flash` + `gemini-embedding-001`)**.

## Rychlé spuštění lokálně

1. **Doplň svůj Gemini API klíč** do souboru `.env.local` (Supabase URL a Publishable klíč pro tvůj projekt `FoodTracker` už jsou předvyplněné):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://kgkljsdfdfptbsoqoold.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xwrozTvfhLBXp4tdYxyahw_e5z_NTcE
   GEMINI_API_KEY=tvuj_klic_z_aistudio_google_com
   ```
   *(Poznámka: Aplikace funguje i před vložením `GEMINI_API_KEY` díky vestavěnému českému záložnímu parseru jídel a aktivit.)*

2. **Spusť vývojový server:**
   ```bash
   npm run dev
   ```
   Otevři http://localhost:3000 v prohlížeči.

3. **První přihlášení a nastavení BMR profilu:**
   - Zaregistruj svůj účet (databáze má zapnutý jednouživatelský zámek `singleton_lock`, takže po uložení tvého profilu už nikdo cizí profil nevytvoří).
   - Vyplň váhu, výšku, rok narození, pohlaví a běžný denní pohyb – aplikace deterministicky spočítá tvé BMR (Mifflin-St Jeor), základní denní výdej i cílová makra.

## Jak funguje zpracování na pozadí

1. **Okamžitý zápis (`POST /api/entries`):** Text jídla nebo aktivity se uloží jako `pending` za pár milisekund a v Next.js `after()` se na pozadí spustí pipeline.
2. **Agent 1 (`src/lib/agents/nutrition-parser.ts`):** Přes `gemini-3.8-flash` (Interactions API Structured Output) rozloží český zápis na suroviny a sportovní aktivity, odhadne gramáže a spočítá makra (`kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`) i spálené kalorie podle MET a tvé váhy.
3. **Deterministický součet (`recalculate_daily_summary` RPC + `src/lib/calculations.ts`):** Součet příjmu, BMR a aktivit probíhá čistě v PostgreSQL a živě se propíše do UI přes **Supabase Realtime**.
4. **Agent 2 (`src/lib/agents/habit-detector.ts`):** Vygeneruje 768d vektor (`gemini-embedding-001`), porovná ho přes `pgvector` HNSW index s historií jídel a při **3. výskytu** jídlo automaticky povýší do horní lišty **Rychlé zaškrtnutí** (1 klepnutí = okamžitý zápis za 0 tokenů).

## Testy a produkční build

```bash
npm test
npm run build
```
