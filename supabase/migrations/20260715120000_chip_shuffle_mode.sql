-- Shuffle Mode persistence for the chip tournament engine.
-- shuffle_mode: the persistent TD-controlled mode is enabled (banner shown).
-- shuffle_ready: an in-progress shuffle cycle has drained the board and is
--   waiting for the TD to press Start Shuffle.
alter table public.chip_config
  add column if not exists shuffle_mode boolean not null default false,
  add column if not exists shuffle_ready boolean not null default false;
