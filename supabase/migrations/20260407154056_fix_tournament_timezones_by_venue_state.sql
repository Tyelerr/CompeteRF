
-- Fix all tournament timezones to match their venue's state
-- Special cases handled: FL Pensacola panhandle (Central), KY split (Florence=Eastern, rest=Central),
-- TN split (Dayton/Eastern TN=Eastern, Nashville area=Central), TX=Central, NM=Mountain
UPDATE tournaments t
SET timezone = CASE
  -- FL: Pensacola panhandle venues = Central time
  WHEN v.state = 'FL' AND v.id IN (242, 245) THEN 'America/Chicago'
  -- KY: Florence (Cincinnati metro) = Eastern
  WHEN v.state = 'KY' AND v.id = 215 THEN 'America/New_York'
  -- KY: Owensboro + Central City = Central
  WHEN v.state = 'KY' AND v.id IN (204, 208) THEN 'America/Chicago'
  -- TN: Dayton (Rhea County, Eastern TN) = Eastern
  WHEN v.state = 'TN' AND v.id = 287 THEN 'America/New_York'
  -- TN: Nashville area, Smyrna, Clarksville = Central
  WHEN v.state = 'TN' THEN 'America/Chicago'
  -- Central time states
  WHEN v.state IN ('AL','AR','IL','KS','LA','MO','MS','OK','TX','WI') THEN 'America/Chicago'
  -- Pacific
  WHEN v.state = 'CA' THEN 'America/Los_Angeles'
  -- Mountain
  WHEN v.state IN ('CO','NM') THEN 'America/Denver'
  -- Arizona (no DST)
  WHEN v.state = 'AZ' THEN 'America/Phoenix'
  -- Eastern time states
  WHEN v.state IN ('CT','FL','GA','IN','ME','MI','NC','NH','NJ','NY','OH','SC') THEN 'America/New_York'
  ELSE t.timezone
END
FROM venues v
WHERE t.venue_id = v.id;
