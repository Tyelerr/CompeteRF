
-- Convert string 'NULL', 'EMPTY', and blank strings in race column to actual NULL
UPDATE tournaments
SET race = NULL
WHERE race IN ('NULL', 'EMPTY')
   OR race = '';
