# Legacy marker backfill write audit

## Pre-write read-only measurement

Measured against the shared `samhan-postgres` container, database `accounting_db`, before any write.

Command:

```text
docker exec samhan-postgres psql -U samhan -d accounting_db -P pager=off -c "SELECT ... FROM tax_invoices ..."
```

Raw aggregate output:

```text
 active | journal_id_null | journal_id_present |   min_created_at    |       max_created_at
--------+-----------------+--------------------+---------------------+----------------------------
     19 |              14 |                  5 | 2026-04-05 10:00:00 | 2026-07-27 03:36:55.268598
(1 row)
```

Raw row output (business identifier only; UUIDs intentionally omitted):

```text
 tax_invoice_no | journal_link |         created_at         |  status   | invoice_type | direction
----------------+--------------+----------------------------+-----------+--------------+-----------
 2026/04/05-1   | NULL         | 2026-04-05 10:00:00        | ISSUED    | SALES        | OUTBOUND
 2026/04/10-1   | NULL         | 2026-04-10 09:00:00        | ISSUED    | PURCHASE     | OUTBOUND
 2026/04/15-1   | NULL         | 2026-04-15 11:00:00        | ISSUED    | SALES        | OUTBOUND
 2026/04/20-1   | NULL         | 2026-04-20 15:00:00        | ISSUED    | PURCHASE     | OUTBOUND
 2026/04/25-1   | NULL         | 2026-04-25 14:00:00        | ISSUED    | SALES        | OUTBOUND
 2026/04/28-1   | NULL         | 2026-04-28 10:00:00        | CANCELLED | SALES        | OUTBOUND
 2026/05/03-1   | NULL         | 2026-05-03 11:00:00        | ISSUED    | SALES        | OUTBOUND
 2026/05/05-1   | PRESENT      | 2026-05-05 09:00:00        | ISSUED    | SALES        | OUTBOUND
 2026/05/07-1   | NULL         | 2026-05-07 13:00:00        | ISSUED    | SALES        | OUTBOUND
 2026/05/09-1   | NULL         | 2026-05-09 15:00:00        | ISSUED    | PURCHASE     | OUTBOUND
 2026/05/10-1   | PRESENT      | 2026-05-10 10:00:00        | ISSUED    | SALES        | OUTBOUND
 2026/07/04-1   | PRESENT      | 2026-07-04 10:49:21.506373 | ISSUED    | SALES        | OUTBOUND
                | NULL         | 2026-07-05 19:54:07.796719 | DRAFT     | SALES        | OUTBOUND
                | NULL         | 2026-07-20 04:00:23.728504 | DRAFT     | SALES        | OUTBOUND
                | NULL         | 2026-07-20 04:02:45.626861 | DRAFT     | SALES        | OUTBOUND
                | NULL         | 2026-07-20 04:03:22.470153 | DRAFT     | SALES        | OUTBOUND
 2026/07/27-1   | PRESENT      | 2026-07-27 01:56:41.172684 | ISSUED    | SALES        | OUTBOUND
 2026/07/26-1   | NULL         | 2026-07-27 03:35:41.288599 | CANCELLED | SALES        | OUTBOUND
 2026/07/26-2   | PRESENT      | 2026-07-27 03:36:55.268598 | CANCELLED | SALES        | OUTBOUND
(19 rows)
```

## Planned reversible change

- Add a nullable policy marker `legacy_read_only` to `tax_invoices`; `false`/`NULL` means normal behavior.
- Backfill only the 19 active rows identified by this audit.
- Record actor, timestamp, reason, and migration version in the migration audit comment/history; no source-slip key is created.
- Rollback is an explicit reverse migration that clears only rows marked by this backfill, never a broad `UPDATE`.
- If a later real source-slip link is established, the link remains the authoritative connection; the marker still prevents mutation until an explicit legacy conversion policy clears it.

## Write status

No shared database write has been performed as of this record.
