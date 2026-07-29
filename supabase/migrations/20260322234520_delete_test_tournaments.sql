
DO $$
DECLARE
  test_ids INT[] := ARRAY[
    75, 88, 93, 94, 95, 96, 97, 98, 99, 100,
    101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
    111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    121, 122, 123, 124, 125
  ];
BEGIN
  -- 1. Delete FK children first
  DELETE FROM favorites           WHERE tournament_id = ANY(test_ids);
  DELETE FROM alert_matches       WHERE tournament_id = ANY(test_ids);
  DELETE FROM tournament_analytics WHERE tournament_id = ANY(test_ids);
  DELETE FROM conversations       WHERE tournament_id = ANY(test_ids);
  DELETE FROM notification_messages WHERE tournament_id = ANY(test_ids);

  -- 2. Null out any soft references on other tournaments pointing back
  UPDATE tournaments
  SET parent_template_id = NULL
  WHERE parent_template_id IN (
    SELECT template_id FROM tournaments WHERE id = ANY(test_ids) AND template_id IS NOT NULL
  )
  AND id <> ALL(test_ids);

  -- 3. Delete the tournaments themselves
  DELETE FROM tournaments WHERE id = ANY(test_ids);
END;
$$;
