-- Add account_id to movements (manual override, optional)
ALTER TABLE movements
    ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;

-- Mark the main (De uso) account
ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT FALSE;

-- Link savings movement types to their savings accounts
ALTER TABLE movement_types
    ADD COLUMN IF NOT EXISTS linked_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;

-- Seed: De uso is the main account
UPDATE accounts SET is_main = TRUE WHERE id = 1;

-- Seed: savings type → savings account links
-- Ahorro, Ahorro Privado → Ahorro account (id=2)
UPDATE movement_types SET linked_account_id = 2 WHERE id IN (189, 190);
-- Vault de Emergencia → Emergencia account (id=5)
UPDATE movement_types SET linked_account_id = 5 WHERE id = 191;
-- Anual Prorrateados → Gastos Anuales Prorrateados account (id=4)
UPDATE movement_types SET linked_account_id = 4 WHERE id = 192;
