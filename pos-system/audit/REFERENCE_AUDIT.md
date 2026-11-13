# MyPOS source and data audit

## Reference files

The supplied PHP application is in `C:/Users/diedr/Downloads/pos-system`. The matching database dump is `C:/Users/diedr/Downloads/pos_db (1).sql`; the supplied `pos_db (1).csv` is a concatenated table export. Originals have not been modified.

## Existing screens and behavior

| Area | Source | Observed behavior |
| --- | --- | --- |
| Login/logout | `index.php`, `logout.php` | Username/password session login. Original implementation stores MD5 hashes and has SQL injection exposure; replace with hashed credentials and protected server routes. |
| Dashboard | `dashboard.php` | Navigation landing screen; no calculated metrics in the current implementation. |
| POS | `modules/sales.php`, `modules/save_sale.php` | Product cards; quantity and per-line amount discount; tax-exempt items; GST after discount; cash/change; receipt print; deducts stock. Original checkout trusts client totals and lacks a transaction. |
| Inventory | `modules/inventory.php`, `modules/edit_product.php`, `modules/print_inventory.php` | Add/edit/delete products, price, GST, tax exemption, stock, description, image, GST-inclusive display and print view. No categories, types, cost, or inventory adjustment log exist. |
| Sales history | `modules/sales_history.php`, `modules/view_sale.php` | All sales, totals, cash/change, detail and print; full report print; destructive sale deletion. |
| Receipts | `modules/print_sale.php`, `modules/receipt.php` | Historical receipt uses sale line data and currently joins current product names; new version snapshots item names on each line. |
| Cash/EOD | `modules/cash.php`, `modules/end_of_day.php`, `modules/process_eod.php`, `modules/eod_history.php`, `modules/print_eod.php`, `modules/print_range.php` | Cash drawer reconciliation, daily total/cash received, float, expected/actual cash, difference, saved EOD history and print/range reports. The separate `end_of_day.php` screen counts 11 coin/note denominations client-side before posting the drawer total. `cash_drawer` table is present but not used by inspected screen code. |
| Password | `reset_password.php` | Change current password; original implementation uses MD5. |

The supplied `partials/header.php`, `assets/style.css`, and `assets/sales.js` provide shared navigation and styling. Product photos are in `uploads/` and `assets/logo.png` is the business logo. `print_range.php` supports printing all receipts for a selected date range, though it is not linked in the shared navigation. `end_of_day.php` also is not in the navigation; the visible EOD link uses `cash.php`.

## Database and relationships

The dump has six tables: `products`, `sales`, `sale_items`, `users`, `cash_drawer`, and `end_of_day`. The only intended relationship is `sale_items.sale_id -> sales.id` and `sale_items.product_id -> products.id`, though the original schema does not declare foreign keys. A line records `product_name`, `tax_exempt`, `qty`, `price`, `gst`, `subtotal`, `discount`, and `gst_rate`, so its snapshot fields are the historical truth. Product cost, SKU, categories, types, and audit history are not part of the source model.

The CSV has repeated header records for `cash_drawer`, `end_of_day`, `products`, `sales`, `sale_items`, and `users` in one stream, rather than one CSV per table. It includes 62 products, 158 sales, and 177 sale-item rows. The SQL dump has the same row counts; sale-item identifiers reach 179 with two gaps. `cash_drawer` and `end_of_day` have table headings but no data rows in either export. The CSV and SQL dump can each supply historical sales and receipt lines. The dumps have 68 sales with null `subtotal`/`gst_total` and 73 sale items with null `product_name`; stored sale total and line pricing values remain present.

## Migration rules

* Import product IDs and current stock exactly. Never replay old sale quantities against imported stock.
* Import sales and sale items with their original IDs, dates, stored totals, payment cash/change, and line snapshots. Do not recalculate old transaction amounts.
* Preserve rows with missing subtotal/tax values and report them for review.
* Repeated import uses original IDs as idempotency keys; conflicts are reported, not silently overwritten.
* The source user is not migrated as an MD5 credential. Provision a new administrator with a strong password through the documented bootstrap command.
* Historical dates in the dump are unzoned local timestamps; preserve wall clock values as stored. New app timezone is configured for America/Belize to match the PHP EOD logic.

## Data audit findings

The SQL dump reports `products` IDs through 90, `sales` auto-increment 159, `sale_items` auto-increment 180, and `users` auto-increment 2. It includes 62 product rows, 158 sale rows, and 177 sale-item rows. The CSV has the same records under the six interleaved table headings. The sale table includes nullable historic subtotal and GST values in later rows. Reconciliation is emitted by the import utility from actual input counts and exact stored totals; it must be run against the destination database before cutover.

## Limits of the supplied source

No product cost, category/type, permissions/roles, card/payment-method detail, supplier, stock movement history, or receipt table exists. Receipts are rendered from sales and sale_items. These fields cannot be recovered from the supplied files. Dashboard statistics are new calculated views of the existing records.

The hardcoded business address conflicts across receipt screens: `print_sale.php` says “Palmar village palmar road,” while range and EOD print screens say “Orange Walk 42 otro benque road.” The new app defaults to the address on the normal sale receipt and allows the operator to set the intended value with `BUSINESS_ADDRESS` before deployment.
