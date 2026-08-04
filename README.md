# Banks page — Export as PDF, Excel, and CSV

## Deploy
Two files, must ship together:
  src/pages/Banks.tsx              (full replacement)
  src/lib/bankStatementExport.ts   (new)
No migration. SUPERSEDES banks_maximize.zip and banks_sort_and_maximize.zip —
this build contains maximize + column sorting + the export menu. Deploy this.

## What it does
Both Export buttons (page header and statement card) open a menu:
  PDF (print / save)  branded A4 document via the popup-then-iframe print
                      helper (printDocument.ts), Malkia teal/maroon header,
                      Money In green / Money Out red, totals strip
  Excel (.xlsx)       title/period/generated header, sized columns, totals
                      (via the xlsx dependency already in the repo)
  CSV                 same columns and escaping as before

## Bug fixed on the way
The old CSV recomputed the running balance over the DISPLAY array — which is
sorted newest-first — starting from zero, so every exported balance was
cumulative-backwards. All three formats now re-sort chronologically and carry
the same per-row running balance the screen shows.

Exports are always chronological regardless of any on-screen column sort:
a statement is an accounting document, and date order is the only correct
order for one.

## Conventions
Export logic lives in a pure lib (bankStatementExport.ts), same pattern as
expenseRegisterExport.ts / salesDayBookExport.ts; PDF goes through
printHtmlDocument so blocked popups fall back to the iframe path with a real
error instead of failing silently.

## Verified
tsc -b and vite build pass on the full repo with these files in place.
