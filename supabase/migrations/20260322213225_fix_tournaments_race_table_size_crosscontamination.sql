
-- Clear race values that are actually table_size data (7ft, 9ft, etc.)
-- table_size column already has the correct value on these rows
UPDATE tournaments
SET race = NULL
WHERE race ~ E'^[0-9]+ft$';
