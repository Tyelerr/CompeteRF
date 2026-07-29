
-- ============================================================
-- Backfill: create a tournament_template for every orphaned
-- recurring tournament, then link the tournament to it.
-- ============================================================
DO $$
DECLARE
  t             RECORD;
  new_tmpl_id   INT;
  rec_type      TEXT;
  rec_week      INT;
  dow_name      TEXT;
BEGIN
  FOR t IN
    SELECT *
    FROM tournaments
    WHERE is_recurring = true
      AND template_id IS NULL
    ORDER BY id
  LOOP

    -- Derive recurrence type from tournament name
    rec_type := CASE
      WHEN lower(t.name) LIKE '%monthly%' THEN 'monthly'
      ELSE 'weekly'
    END;

    -- For monthly: which Nth weekday? (e.g. March 21 = 3rd Saturday)
    rec_week := CASE
      WHEN rec_type = 'monthly' THEN CEIL(EXTRACT(DAY FROM t.tournament_date) / 7.0)::INT
      ELSE NULL
    END;

    -- Map DOW integer to text
    dow_name := CASE EXTRACT(DOW FROM t.tournament_date)::INT
      WHEN 0 THEN 'sunday'
      WHEN 1 THEN 'monday'
      WHEN 2 THEN 'tuesday'
      WHEN 3 THEN 'wednesday'
      WHEN 4 THEN 'thursday'
      WHEN 5 THEN 'friday'
      WHEN 6 THEN 'saturday'
    END;

    -- Insert the template
    INSERT INTO tournament_templates (
      venue_id, director_id,
      name, description, description_es,
      game_type, tournament_format, game_spot, race, table_size,
      equipment, number_of_tables,
      entry_fee, added_money, side_pots,
      max_fargo, required_fargo_games, reports_to_fargo, open_tournament,
      phone_number, thumbnail,
      recurrence_type, recurrence_day, recurrence_week,
      start_time, series_start_date, series_end_date,
      horizon_days, status,
      chip_ranges, calcutta
    ) VALUES (
      t.venue_id, t.director_id,
      t.name, t.description, t.description_es,
      t.game_type, t.tournament_format, t.game_spot, t.race, t.table_size,
      t.equipment, t.number_of_tables,
      t.entry_fee, t.added_money, t.side_pots,
      t.max_fargo, t.required_fargo_games, t.reports_to_fargo, t.open_tournament,
      t.phone_number, t.thumbnail,
      rec_type, dow_name, rec_week,
      t.start_time, t.tournament_date, NULL,
      30, 'active',
      t.chip_ranges, t.calcutta
    )
    RETURNING id INTO new_tmpl_id;

    -- Link the existing tournament instance to its new template
    UPDATE tournaments
    SET
      template_id        = new_tmpl_id,
      parent_template_id = new_tmpl_id
    WHERE id = t.id;

  END LOOP;
END;
$$;
