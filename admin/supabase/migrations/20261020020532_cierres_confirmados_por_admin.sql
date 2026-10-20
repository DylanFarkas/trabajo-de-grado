-- Un reporte comunitario que un admin confirmó no baja por puntaje: solo lo reabren los votos en contra.

create or replace function private.recalc_road_closure(target bigint, extend boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  closure public.road_closures%rowtype;
  confirm_total integer;
  deny_total integer;
  net integer;
  witness boolean;
  next_status text;
begin
  select * into closure from public.road_closures where id = target for update;
  if not found or closure.status not in ('candidate', 'provisional', 'confirmed') then
    return;
  end if;

  select
    coalesce(sum(case when vote = 'still_closed' then case when on_site then 2 else 1 end end), 0),
    coalesce(sum(case when vote = 'now_open' then case when on_site then 2 else 1 end end), 0),
    coalesce(bool_or(vote = 'still_closed' and on_site), false)
  into confirm_total, deny_total, witness
  from public.closure_votes
  where closure_id = target;

  if closure.source = 'community' then
    confirm_total := confirm_total + case when closure.on_site_report then 2 else 1 end;
  end if;
  witness := witness or closure.on_site_report;
  net := confirm_total - deny_total;

  if closure.source = 'admin' then
    next_status := closure.status;
  elsif deny_total >= 4 and deny_total >= confirm_total then
    next_status := 'reopened';
  elsif closure.status = 'confirmed' and closure.resolved_by is not null then
    next_status := 'confirmed';
  elsif net >= 6 or (closure.status = 'confirmed' and net >= 4) then
    next_status := 'confirmed';
  elsif witness and net >= 2 then
    next_status := 'provisional';
  else
    next_status := 'candidate';
  end if;

  update public.road_closures
  set
    confirm_score = confirm_total,
    deny_score = deny_total,
    status = next_status,
    confirmed_at = case when next_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    last_confirmed_at = case when extend then now() else last_confirmed_at end,
    resolved_at = case when next_status = 'reopened' then now() else resolved_at end,
    expires_at = case
      when closure.source = 'community'
        and next_status in ('candidate', 'provisional', 'confirmed')
        and (extend or next_status <> closure.status)
        then greatest(expires_at, now() + private.closure_window(next_status))
      else expires_at
    end
  where id = target;
end;
$$;

revoke all on function private.recalc_road_closure(bigint, boolean) from public;
