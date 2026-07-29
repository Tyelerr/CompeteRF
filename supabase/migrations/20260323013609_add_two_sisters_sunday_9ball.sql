
DO $$
DECLARE
  new_tmpl_id INT;
BEGIN

  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race,
    entry_fee,
    phone_number,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    283, 47,
    'Sunday 9-Ball Tournament',
    'Race to 3W/2L. Opponent racks, winner breaks. $20 entry includes green fee. $15 ladies entry. Last lady payout. Sign-ups at 3:00 PM, play starts 4:00 PM.',
    '9 Ball', 'double_elimination',
    '3/2',
    20.00,
    '(985) 781-0059',
    'weekly', 'sunday',
    '16:00:00', '2026-03-22',
    30, 'active',
    false, false, false
  )
  RETURNING id INTO new_tmpl_id;

  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    race,
    tournament_date, start_time, timezone,
    entry_fee, thumbnail,
    phone_number,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    283, 47, new_tmpl_id, new_tmpl_id,
    'Sunday 9-Ball Tournament',
    'Race to 3W/2L. Opponent racks, winner breaks. $20 entry includes green fee. $15 ladies entry. Last lady payout. Sign-ups at 3:00 PM, play starts 4:00 PM.',
    '9 Ball', 'double_elimination',
    '3/2',
    '2026-03-22', '16:00:00', 'America/Chicago',
    20.00, '9-ball',
    '(985) 781-0059',
    true, 'active',
    false, false, false
  );

END;
$$;

SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC
LIMIT 2;
