# MyPOS Web

A Vercel-ready web edition of the H&A Home Centre POS, based on the supplied MyPOS PHP source, MySQL dump, and stitched CSV export. Business records live in PostgreSQL; the Vercel filesystem is not used for transaction storage.

## What is implemented

* Password-protected staff sign-in with bcrypt hashes, signed HTTP-only sessions, and password changes.
* Database-backed business overview, low stock, recent activity, and 30-day sales metrics.
* Product catalog with prices, GST/tax exemption, cost, SKU, stock, description and product images; create/edit/deactivate, inventory adjustment history, search, and print. Existing reference images are bundled as static assets; new uploads use persistent Vercel Blob storage.
* Point of sale with search, cart quantities, per-line dollar discounts, GST after discount, cash/change, and printable receipt.
* Server-calculated checkout in a serializable database transaction with atomic stock checks and an idempotency key.
* Searchable, date-filtered sales history and receipts generated from sale-line snapshots, plus report printing.
* End-of-day cash reconciliation with coin/note denomination count, history, print and delete.
* Relational PostgreSQL schema and an idempotent legacy MySQL dump/CSV import command.

The source system is single-store and has no categories, suppliers, roles/permissions, card tender, or cost tracking. Categories, permissions, or tender types are not fabricated. Product cost and SKU are optional additions for future use. New product image values can refer to one of the included static `/uploads` assets or a public hosted image URL. Image upload uses Vercel Blob and requires a connected Blob store; images are not written to Vercel's ephemeral filesystem.

The original normal-sale receipt and its range/EOD reports contain two different hardcoded business addresses. The default follows the normal sale receipt; set `BUSINESS_ADDRESS` to the address the owner confirms.

## Reference data notes

`C:/Users/diedr/Downloads/pos_db (1).sql` contains all six legacy table definitions and the complete sale/sale-item export. `pos_db (1).csv` is a single CSV stream with six repeated header sections, not six files. Both exports contain 62 products, 158 sales, and 177 sale-item rows; sale-item IDs reach 179 with two gaps. The CSV also includes the transaction and line-item sections, so either file can restore historical receipts. The exports contain no cash drawer or end-of-day records. They include 68 sales with null header subtotal/GST and 73 sale items with null product names. The importer preserves missing sale header values, uses linked catalog names only for the 73 unnamed lines, marks those names as inferred, and flags affected rows in the import report. Stored line prices, GST, discounts, subtotals, and original sale totals remain intact.

The importer reads all repeated CSV table sections, or parses MySQL `INSERT` rows from the SQL dump. When both are supplied, SQL product attributes are preferred and CSV stock replaces matching stock values. It does not deduct historic sales from stock. If a product appears only in the CSV it is included; if a SQL product is absent from the CSV, the SQL stock value stays. The JSON report compares source and destination totals, reconciles each sale's stored total against its stored line subtotal/GST sum, and lists rows for manual review without changing them. Original files are only read. Import report JSON files are written in the working directory and ignored by Git.

## Requirements

* Node.js 22.12 or newer
* A PostgreSQL database reachable from the app (Neon or Supabase PostgreSQL are compatible)
* npm

## Local setup

1. Install packages: `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, a random `SESSION_SECRET` with at least 32 characters, and business details. Keep `.env` private.
3. Apply schema migrations: `npm run db:deploy`, then generate the typed client with `npm run db:generate`.
4. Create the first account by setting `ADMIN_USERNAME` and `ADMIN_PASSWORD` (12+ characters) in your shell and running `npm run admin:create`. The original legacy MD5 user is intentionally not imported; create a fresh strong password.
5. (Optional, recommended before deployment) Import a **backup copy** of the supplied SQL dump and CSV snapshot:

   ```powershell
   npm run import:legacy -- "C:\Users\diedr\Downloads\pos_db (1).sql" --inventory-csv "C:\Users\diedr\Downloads\pos_db (1).csv"
   ```

   The import is additive and safe to rerun: existing original IDs are counted as duplicates and not overwritten. Products are imported first, then sales, sale items, cash drawer and EOD rows. Source user credentials are excluded. The command prints and writes a JSON report with import counts, source/destination sales totals, duplicate IDs, failed rows, and review findings. Review the report and resolve failures before business cutover. A `.csv` by itself imports all available source sections.
6. Start the app: `npm run dev`, then open `http://localhost:3000`.

The importer should be run against a clean, backed-up target database before staff begin using the new app. It never deletes data. Imported sales are protected from the sales-history delete action. New sales and inventory operations can continue after import.

## Vercel deployment

1. Create a persistent PostgreSQL database with Neon or Supabase and copy its pooled/runtime connection string into Vercel's `DATABASE_URL` environment variable. Configure a direct/unpooled URL only for local migration tooling if your provider requires one.
2. Push this repository to GitHub and import it into Vercel as a Next.js project.
3. Add `DATABASE_URL`, `SESSION_SECRET`, `BUSINESS_TIMEZONE`, `BUSINESS_NAME`, `BUSINESS_ADDRESS`, `BUSINESS_TIN`, and `BUSINESS_CURRENCY` to Vercel for Production and Preview as appropriate. To enable photo uploads, create and connect a **public** Vercel Blob store and set its `BLOB_READ_WRITE_TOKEN`. Never use `NEXT_PUBLIC_` for secrets.
4. Deploy. `npm run build` runs Prisma Client generation; run `npm run db:deploy` once against the production database before using the app. For future schema changes, commit a reviewed migration and apply `npm run db:deploy` before or as part of rollout. Avoid destructive reset/push commands against production.
5. Create the first production administrator using the same database connection and `ADMIN_USERNAME`/`ADMIN_PASSWORD` environment variables in a trusted local shell: `npm run admin:create`. Remove those temporary shell variables afterward.
6. Before enabling staff access, take a database backup, run `npm run import:legacy` against that production database if not already imported, inspect its JSON report, and verify counts and totals against the source. Do not import the source a second time into a live database unless the report's duplicate counts are expected.

Vercel's local filesystem is only used to serve bundled logo/product images. Transaction records, credentials, stock, and reports are persisted in PostgreSQL. The deployment does not depend on a local PHP/Apache process.

## Database model

The Prisma schema maps the original product, sale, sale-item, cash drawer, and end-of-day tables and introduces `User` with bcrypt credentials. Sale items store a historical name, tax treatment, price, GST, quantity, discount and subtotal independently of the current product catalog. Optional fields support SKU/cost and customer name/note; inventory adjustment records audit manual stock changes. Source table IDs are retained during import.

## Verification status and known gaps

The repository is structured for deployment and has not been connected to a PostgreSQL database in this workspace. Therefore the production CSV/SQL import, end-to-end authenticated flows, and persistence after Vercel redeployment still require a configured database and credentials. Do not treat migration as complete until the importer report has been reviewed against the original files and the business has verified sample receipts and current stock. The supplied PHP source itself is insecure (MD5 passwords, raw SQL, client-trusted totals, and non-transactional checkout); this implementation replaces those paths rather than carrying those vulnerabilities forward.
