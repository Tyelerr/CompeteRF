
DO $$
DECLARE
  new_tmpl_id INT;
BEGIN

  -- ============================================================
  -- 1. Insert weekly Monday template (venue already exists: 189)
  -- ============================================================
  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, table_size,
    entry_fee,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    189, 47,
    'Pooligans Open Weekly 9-Ball Tournament',
    'Modified single elimination (guarantees two matches, not necessarily two losses). BCA rules. No 3-foul, no jump shots, no outside food/drinks. Race is Fargo-dependent: Under 550 = 4W/3L; 551–600 = 5W/4L; Over 600 = 6W/5L. No FargoRate plays as 601. Max 16 players. $40 entry includes $5 green fee + $5 TD fee. Prizes: top 4. Registration 5:30 PM, matches start 6:00 PM.',
    '9 Ball', 'single_elimination',
    'Fargo Dependent', '7ft',
    40.00,
    'weekly', 'monday',
    '18:00:00', '2026-01-26',
    30, 'active',
    true, true, false
  )
  RETURNING id INTO new_tmpl_id;

  -- ============================================================
  -- 2. Insert next upcoming instance (Monday March 23)
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    race, table_size,
    tournament_date, start_time, timezone,
    entry_fee,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    189, 47, new_tmpl_id, new_tmpl_id,
    'Pooligans Open Weekly 9-Ball Tournament',
    'Modified single elimination (guarantees two matches, not necessarily two losses). BCA rules. No 3-foul, no jump shots, no outside food/drinks. Race is Fargo-dependent: Under 550 = 4W/3L; 551–600 = 5W/4L; Over 600 = 6W/5L. No FargoRate plays as 601. Max 16 players. $40 entry includes $5 green fee + $5 TD fee. Prizes: top 4. Registration 5:30 PM, matches start 6:00 PM.',
    '9 Ball', 'single_elimination',
    'Fargo Dependent', '7ft',
    '2026-03-23', '18:00:00', 'America/Los_Angeles',
    40.00,
    true, 'active',
    true, true, false
  );

END;
$$;

-- Fill the rest of the 30-day window
SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC
LIMIT 3;
