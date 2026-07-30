-- Guided-tour progress is stored as a zero-based step index. Enforce the
-- versioned definition bounds at the table boundary as well as in the RPC.
-- Historical completion preferences may use the former one-past-the-end value
-- `6`; the application already treats them as completed. Keep those
-- non-sensitive preferences without rewriting them while enforcing the correct
-- bound on every new insert or update.

alter table public.guided_tour_states
  add constraint guided_tour_states_v1_step_bounds check (
    (tour_id='first-run-rfp-review' and last_completed_step between 0 and 5)
    or (tour_id='stakeholder-demo' and last_completed_step between 0 and 13)
  ) not valid;

create function public.enforce_guided_tour_step_bounds_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if
    (new.tour_id='first-run-rfp-review' and new.last_completed_step between 0 and 5)
    or (new.tour_id='stakeholder-demo' and new.last_completed_step between 0 and 13)
  then
    return new;
  end if;
  raise exception 'invalid guided tour state';
end
$$;

create trigger guided_tour_states_v1_step_bounds
  before insert or update on public.guided_tour_states
  for each row execute function public.enforce_guided_tour_step_bounds_v1();
