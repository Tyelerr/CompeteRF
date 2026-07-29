
UPDATE tournaments
SET
  is_hidden = true,
  status = 'archived',
  archived_at = now()
WHERE id IN (580, 581, 582, 583, 584, 585, 586, 587, 588);
