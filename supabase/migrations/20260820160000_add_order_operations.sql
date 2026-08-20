-- Shopify-style order operations for tracking, notes, tags, archiving and returns.

alter table public.orders
  add column archived boolean not null default false,
  add column tags text[] not null default '{}'::text[],
  add column tracking_carrier text not null default '',
  add column tracking_url text not null default '',
  add column shipped_at timestamptz,
  add column delivered_at timestamptz,
  add column returned_at timestamptz;

create index orders_archived_created_idx on public.orders (archived, created_at desc);

alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check
check (kind in ('contact_notification', 'order_customer', 'order_admin', 'admin_customer', 'shipping_customer'));

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  author_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index order_notes_order_idx on public.order_notes (order_id, created_at desc);
create index order_notes_author_idx on public.order_notes (author_id);

grant select, insert, delete on public.order_notes to authenticated;
alter table public.order_notes enable row level security;

create policy "admins read order notes" on public.order_notes
for select to authenticated using (private.is_admin());
create policy "admins create order notes" on public.order_notes
for insert to authenticated with check (
  private.is_admin() and author_id = (select auth.uid())
);
create policy "owners and admins delete order notes" on public.order_notes
for delete to authenticated using (private.is_admin(array['owner', 'admin']));

create function public.return_admin_order(
  p_order_id uuid,
  p_restore_stock boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order record;
  v_actor_email text;
  v_restored integer := 0;
begin
  if (select auth.uid()) is null or not private.is_admin(array['owner', 'admin']) then
    raise exception 'Geen toestemming om retouren te verwerken.';
  end if;

  select id, order_number, fulfillment_status
  into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Bestelling niet gevonden.'; end if;

  if v_order.fulfillment_status = 'returned' then
    return jsonb_build_object('order_id', v_order.id, 'stock_restored', 0, 'already_returned', true);
  end if;

  if p_restore_stock then
    with restored as (
      update public.product_variants as variant
      set stock = variant.stock + item.quantity
      from (
        select variant_id, sum(quantity)::integer as quantity
        from public.order_items
        where order_id = v_order.id and variant_id is not null
        group by variant_id
      ) as item
      where variant.id = item.variant_id
      returning item.quantity
    )
    select coalesce(sum(quantity), 0)::integer into v_restored from restored;
  end if;

  update public.orders
  set fulfillment_status = 'returned', status = 'completed', returned_at = now()
  where id = v_order.id;

  select email into v_actor_email from public.admin_profiles where id = (select auth.uid());
  insert into public.activity_log (actor_id, actor_email, action, entity_type, entity_id, details)
  values ((select auth.uid()), coalesce(v_actor_email, ''), 'Retour verwerkt', 'order', v_order.id::text,
    jsonb_build_object('order_number', v_order.order_number, 'stock_restored', v_restored));

  return jsonb_build_object('order_id', v_order.id, 'stock_restored', v_restored, 'already_returned', false);
end;
$$;

revoke all on function public.return_admin_order(uuid, boolean) from public, anon, authenticated;
grant execute on function public.return_admin_order(uuid, boolean) to authenticated;
