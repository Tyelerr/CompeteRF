
-- Issue 1: 7 rows where description = timezone string and phone_number = real description text
-- Move phone_number → description, clear phone_number
UPDATE tournaments
SET
  description = phone_number,
  phone_number = NULL
WHERE id IN (192, 222, 237, 243, 250, 251, 254);

-- Issue 2: 3 rows where description = phone number digits and phone_number = "TRUE"/"FALSE"
-- Move description → phone_number, clear description
UPDATE tournaments
SET
  phone_number = description,
  description = NULL
WHERE id IN (159, 196, 220);
