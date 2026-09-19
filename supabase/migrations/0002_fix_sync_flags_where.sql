-- Supabase enforces "UPDATE requires a WHERE clause" (pg_safeupdate).
-- sync_work_item_flags intentionally updates every work item, so make that explicit.
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

grant execute on function public.sync_work_item_flags(uuid) to authenticated;
