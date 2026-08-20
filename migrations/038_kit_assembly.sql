-- ─── Migration 038: Kit Assembly ────────────────────────────────────────────
-- Feature: assemble sellable kits (e.g. CS Heaven Kit) from existing products.
-- The kit is a normal row in `products`; this migration adds the recipe table
-- and widens voucher/ledger constraints so assembly movements can post.
--
-- Additive only. Safe to apply while the app is live:
--   * new table kit_components
--   * check constraints widened (existing rows all remain valid)
--   * one approval_types seed row
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Recipe table: which components make up one unit of a kit product
CREATE TABLE IF NOT EXISTS kit_components (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_product_id        uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id  uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty                   numeric NOT NULL CHECK (qty > 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kit_components_no_self CHECK (kit_product_id <> component_product_id),
  CONSTRAINT kit_components_unique UNIQUE (kit_product_id, component_product_id)
);

CREATE INDEX IF NOT EXISTS idx_kit_components_kit ON kit_components(kit_product_id);
CREATE INDEX IF NOT EXISTS idx_kit_components_component ON kit_components(component_product_id);

-- RLS follows the vouchers/item_ledger_entries pattern: enabled, authenticated full access
ALTER TABLE kit_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kit_components_authenticated_all ON kit_components;
CREATE POLICY kit_components_authenticated_all ON kit_components
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Standing grant rule: explicit grants in the same migration as the table.
-- RLS policies alone are insufficient if default schema privileges are revoked.
GRANT SELECT ON kit_components TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON kit_components TO authenticated;

-- 2. Widen item_ledger_entries checks: assembly_in / assembly_out + kit_assembly
ALTER TABLE item_ledger_entries DROP CONSTRAINT IF EXISTS item_ledger_entries_entry_type_check;
ALTER TABLE item_ledger_entries ADD CONSTRAINT item_ledger_entries_entry_type_check
  CHECK (entry_type::text = ANY (ARRAY[
    'sale','purchase','grn','return','purchase_return','opening_stock',
    'positive_adjustment','negative_adjustment','write_off',
    'transfer_in','transfer_out','internal_use',
    'assembly_in','assembly_out'
  ]::text[]));

ALTER TABLE item_ledger_entries DROP CONSTRAINT IF EXISTS item_ledger_entries_document_type_check;
ALTER TABLE item_ledger_entries ADD CONSTRAINT item_ledger_entries_document_type_check
  CHECK (document_type::text = ANY (ARRAY[
    'cash_sale','sales_invoice','grn','credit_note','sales_return','purchase_return',
    'stock_transfer','stock_adjustment','opening_stock','data_import','backfill',
    'internal_use','kit_assembly'
  ]::text[]));

-- 3. Widen vouchers type check: kit_assembly
ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_type_check;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_type_check
  CHECK (type::text = ANY (ARRAY[
    'cash_sale','sales_invoice','sales_return','proforma','credit_note','debit_note',
    'cash_payment','cash_receipt','bank_payment','bank_receipt','bank_transfer','contra',
    'petty_cash','purchase','purchase_order','purchase_invoice','purchase_return','grn',
    'import_order','opening_stock','stock_adjustment','stock_transfer','internal_use',
    'journal_entry','kit_assembly'
  ]::text[]));

-- 4. Approval type so Kit Assembly can be governed from Approval Workflows.
--    No settings row is seeded: checkApprovalRequired safely returns
--    { requiresApproval: false } until a workflow is configured in the UI.
INSERT INTO approval_types (code, name, category, description, icon, color, is_system)
SELECT 'kit_assembly', 'Kit Assembly', 'inventory',
       'Assemble or disassemble product kits from component stock', 'package', '#8b5cf6', true
WHERE NOT EXISTS (SELECT 1 FROM approval_types WHERE code = 'kit_assembly');
