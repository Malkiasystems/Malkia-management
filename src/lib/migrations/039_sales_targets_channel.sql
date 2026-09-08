-- APPLIED TO PROD 8 Sep 2026 via MCP. In repo for the record.
-- Channel scope for sales targets: 'retail' counts cash_sale vouchers
-- only, 'wholesale' counts sales_invoice vouchers only, 'all' both.
-- Existing rows default to 'all' (unchanged behavior).
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'all';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_targets_channel_check') THEN
    ALTER TABLE sales_targets ADD CONSTRAINT sales_targets_channel_check CHECK (channel IN ('all','retail','wholesale'));
  END IF;
END $$;
