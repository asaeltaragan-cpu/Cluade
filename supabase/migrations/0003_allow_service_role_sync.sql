-- The Airtable sync runs from the server using the service-role key, which
-- has no auth.uid() (it isn't a logged-in user). Let it call this function
-- alongside logged-in managers, without weakening the check for normal users.
create or replace function public.sync_work_item_flags(_import_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_manager(auth.uid()) or auth.role() = 'service_role') then
    raise exception 'not allowed';
  end if;

  update public.work_items w
  set missing_in_latest = not exists (
    select 1 from public.sales_facts f
    where f.import_id = _import_id
      and f.agent = w.agent
      and f.entity_id = w.entity_id
      and f.product = w.product
  )
  where true;
end;
$$;

grant execute on function public.sync_work_item_flags(uuid) to authenticated, service_role;
