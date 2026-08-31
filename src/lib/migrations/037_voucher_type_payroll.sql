-- APPLIED TO PROD 31 Aug 2026 via MCP. In repo for the record.
-- The HRM payroll poster inserts vouchers with type 'payroll', but
-- vouchers_type_check never included it, and the app's insert had no
-- error check, so every payroll voucher since the module shipped
-- silently failed to write (zero type='payroll' rows despite posted
-- runs for 2026-04, 2026-05, 2026-08). Adds 'payroll' to the list.
ALTER TABLE vouchers DROP CONSTRAINT vouchers_type_check;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_type_check CHECK (((type)::text = ANY (ARRAY['cash_sale'::text, 'sales_invoice'::text, 'sales_return'::text, 'proforma'::text, 'credit_note'::text, 'debit_note'::text, 'cash_payment'::text, 'cash_receipt'::text, 'bank_payment'::text, 'bank_receipt'::text, 'bank_transfer'::text, 'contra'::text, 'petty_cash'::text, 'purchase'::text, 'purchase_order'::text, 'purchase_invoice'::text, 'purchase_return'::text, 'grn'::text, 'import_order'::text, 'opening_stock'::text, 'stock_adjustment'::text, 'stock_transfer'::text, 'internal_use'::text, 'journal_entry'::text, 'kit_assembly'::text, 'payroll'::text])));
