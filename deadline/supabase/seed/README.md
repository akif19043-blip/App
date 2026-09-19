# Seed data

`catalog.sql` is **generated** from the TypeScript catalogues in
`packages/shared`. Regenerate it after changing items, weapons or missions:

```bash
pnpm db:seed:generate
```

Apply it after the migrations:

```bash
supabase db push                 # runs supabase/migrations
psql "$DATABASE_URL" -f supabase/seed/catalog.sql
```

Or, with the Supabase CLI configured for the project:

```bash
supabase db reset                # migrations + seed
```

The `items`, `weapons` and `missions` tables exist so the database can join
against real rows (raid ledgers, market transactions, mission rewards). They
are mirrors — gameplay always reads the TypeScript definitions, so the two can
never disagree about balance mid-raid.
