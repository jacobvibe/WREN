-- DB-level backstop for the 150-item free-tier cap.
-- Client-side and Edge Function guards fire first; this prevents cap bypass
-- via direct API calls or any path that bypasses the application layer.

create or replace function enforce_item_cap()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  -- Onboarding placeholder rows are unclaimed pre-auth items; skip the cap.
  if NEW.user_id = 'onboarding-placeholder' then
    return NEW;
  end if;

  select count(*) into v_count
    from items
   where user_id = NEW.user_id;

  if v_count >= 150 then
    raise exception 'item_cap_reached'
      using hint = 'Free accounts can store up to 150 items.';
  end if;

  return NEW;
end;
$$;

create trigger check_item_cap
  before insert on items
  for each row
  execute function enforce_item_cap();

comment on function enforce_item_cap() is
  'Raises item_cap_reached before any INSERT that would push a user past 150 items. Onboarding-placeholder rows are exempt.';
