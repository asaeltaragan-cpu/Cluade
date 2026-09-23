-- 0003 let the service-role key call this function for the Airtable sync,
-- which has been removed. Nothing else needs service-role access to it, so
-- revert to the original manager-only check.
create or replace function public.sync_work_item_flags(_import_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager(auth.uid()) then
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

revoke execute on function public.sync_work_item_flags(uuid) from service_role;
grant execute on function public.sync_work_item_flags(uuid) to authenticated;
