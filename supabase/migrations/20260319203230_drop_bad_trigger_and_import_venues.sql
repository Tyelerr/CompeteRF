
-- Step 1: Drop the recursive trigger and function entirely
-- pg_cron handles this job now — the trigger was only ever a backup
-- and its design (row trigger doing table-wide UPDATE) causes infinite recursion
DROP TRIGGER IF EXISTS trg_auto_complete_tournaments ON tournaments;
DROP FUNCTION IF EXISTS auto_complete_past_tournaments();

-- Step 2: Add temp staging_id column
ALTER TABLE venues ADD COLUMN IF NOT EXISTS staging_id integer;

-- Step 3: Fix Metro Sportz duplicate
UPDATE tournaments SET venue_id = 9 WHERE venue_id = 11;
DELETE FROM venue_owners WHERE venue_id = 11;
DELETE FROM venue_tables WHERE venue_id = 11;
DELETE FROM venues WHERE id = 11;

-- Step 4: Import all staging venues
INSERT INTO venues (
  venue, address, city, state, zip_code, phone,
  latitude, longitude, google_place_id,
  status, created_at, updated_at, staging_id
)
SELECT
  vs.venue, vs.address, vs.city, vs.state, vs.zip_code, vs.phone,
  vs.latitude, vs.longitude, vs.google_place_id,
  'active', now(), now(), vs.id
FROM venue_staging vs
WHERE vs.address IS NOT NULL
  AND vs.state IS NOT NULL
  AND LENGTH(vs.state) = 2
  AND vs.zip_code IS NOT NULL;

-- Step 5: Insert venue_tables from parsed Additional notes
INSERT INTO venue_tables (venue_id, table_size, brand, quantity)
WITH parsed AS (
  SELECT
    vs.id AS staging_id,
    m[1]::integer AS quantity,
    CASE
      WHEN m[2] ~ '^\d+$' THEN m[2] || 'ft'
      ELSE m[2]
    END AS table_size,
    CASE LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m[3], 's$', '', 'i'), '\s+tables?$', '', 'i')))
      WHEN 'diamond'     THEN 'Diamond'
      WHEN 'valley'      THEN 'Valley'
      WHEN 'gold crown'  THEN 'Gold Crown'
      WHEN 'brunswick'   THEN 'Brunswick'
      WHEN 'olhausen'    THEN 'Olhausen'
      WHEN 'predator'    THEN 'Predator'
      WHEN 'rasson'      THEN 'Rasson'
      WHEN 'gandy'       THEN 'Gandy'
      WHEN 'platin'      THEN 'Platin'
      WHEN 'steel clash' THEN 'Steel Clash'
      WHEN 'snooker'     THEN 'Snooker'
      WHEN 'carom'       THEN 'Carom'
      WHEN '3cushion'    THEN 'Carom'
      WHEN '3 cushion'   THEN 'Carom'
      WHEN 'unknown'     THEN 'Unknown'
      ELSE INITCAP(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(m[3], 's$', '', 'i'), '\s+tables?$', '', 'i')))
    END AS brand
  FROM venue_staging vs,
    REGEXP_MATCHES(
      LOWER(vs."Additional notes"),
      '(\d+)\s+(\d+|snooker|carom)\s*(?:ft|foot)?\s*(diamond|valley|gold\s*crown|brunswick|olhausen|predator|rasson|gandy|platin|steel\s*clash|snooker|carom|3\s*cushion|unknown)s?(?:\s+tables?)?',
      'g'
    ) AS m
  WHERE vs."Additional notes" IS NOT NULL
    AND vs."Additional notes" ~* '\d+\s+\d*\s*ft'

  UNION ALL

  SELECT
    vs.id,
    m[1]::integer,
    'Carom',
    'Carom'
  FROM venue_staging vs,
    REGEXP_MATCHES(LOWER(vs."Additional notes"), '(\d+)\s+3\s*cushion', 'g') AS m
  WHERE vs."Additional notes" IS NOT NULL
)
SELECT v.id, p.table_size, p.brand, p.quantity
FROM parsed p
JOIN venues v ON v.staging_id = p.staging_id
WHERE v.staging_id IS NOT NULL;

-- Step 6: Clean up temp column
ALTER TABLE venues DROP COLUMN IF EXISTS staging_id;
