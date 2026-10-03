-- Product reviews written by visitors on the product page. New reviews are
-- stored as pending and only become public after an admin approves them.
-- Visitors never touch the table directly: they submit through
-- submit_product_review() and read through get_product_reviews(), which only
-- return public fields (never the optional e-mail address or fingerprint).

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null default 'zol-inlegzolen' check (product_slug ~ '^[a-z0-9-]{1,80}$'),
  rating smallint not null check (rating between 1 and 5),
  title text not null check (title = btrim(title) and char_length(title) between 2 and 120),
  body text not null check (body = btrim(body) and char_length(body) between 10 and 2000),
  author_name text not null check (author_name = btrim(author_name) and char_length(author_name) between 2 and 60),
  email text check (
    email is null
    or (
      email = lower(btrim(email))
      and char_length(email) between 5 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  fingerprint text not null default '' check (char_length(fingerprint) <= 64),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_reviews_public_idx
on public.product_reviews (product_slug, created_at desc)
where status = 'approved';

create index product_reviews_status_idx
on public.product_reviews (status, created_at desc);

create index product_reviews_fingerprint_idx
on public.product_reviews (fingerprint, created_at desc);

create or replace function private.set_product_review_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger product_reviews_updated_at
before update on public.product_reviews
for each row execute function private.set_product_review_updated_at();

alter table public.product_reviews enable row level security;
revoke all on table public.product_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.product_reviews to service_role;
grant select, update, delete on table public.product_reviews to authenticated;

create policy "admins read product reviews"
on public.product_reviews for select
to authenticated
using ((select private.is_admin(array['owner', 'admin', 'editor'])));

create policy "admins moderate product reviews"
on public.product_reviews for update
to authenticated
using ((select private.is_admin(array['owner', 'admin', 'editor'])))
with check ((select private.is_admin(array['owner', 'admin', 'editor'])));

create policy "admins delete product reviews"
on public.product_reviews for delete
to authenticated
using ((select private.is_admin(array['owner', 'admin'])));

create or replace function public.submit_product_review(
  p_rating integer,
  p_title text,
  p_body text,
  p_author_name text,
  p_email text default null,
  p_company text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text;
  v_fingerprint text;
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[ \t]+', ' ', 'g'));
  v_name text := btrim(regexp_replace(coalesce(p_author_name, ''), '[[:space:]]+', ' ', 'g'));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  -- Bots that fill the hidden field get a normal-looking answer and nothing is stored.
  if btrim(coalesce(p_company, '')) <> '' then
    return jsonb_build_object('success', true);
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Kies een score van 1 tot 5 sterren.' using errcode = '22023';
  end if;
  if char_length(v_title) not between 2 and 120 then
    raise exception 'Geef je review een korte titel.' using errcode = '22023';
  end if;
  if char_length(v_body) not between 10 and 2000 then
    raise exception 'Schrijf minimaal 10 tekens over je ervaring.' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'Vul je voornaam in.' using errcode = '22023';
  end if;
  if v_email is not null and (char_length(v_email) not between 5 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Controleer je e-mailadres of laat het veld leeg.' using errcode = '22023';
  end if;

  v_ip := coalesce(
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(v_headers ->> 'x-real-ip', ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'unknown'
  );
  v_fingerprint := encode(sha256(convert_to(v_ip || '|' || coalesce(v_headers ->> 'user-agent', 'unknown'), 'UTF8')), 'hex');

  if (
    select count(*) from public.product_reviews
    where fingerprint = v_fingerprint and created_at > now() - interval '24 hours'
  ) >= 3 then
    raise exception 'Je hebt vandaag al reviews gestuurd. Probeer het morgen opnieuw.' using errcode = 'P0001';
  end if;

  -- Keep the moderation queue manageable if someone floods the form.
  if (
    select count(*) from public.product_reviews
    where status = 'pending' and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'Er komen nu veel reviews binnen. Probeer het over een uur opnieuw.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.product_reviews
    where body = v_body and created_at > now() - interval '30 days'
  ) then
    return jsonb_build_object('success', true, 'duplicate', true);
  end if;

  insert into public.product_reviews (rating, title, body, author_name, email, fingerprint)
  values (p_rating, v_title, v_body, v_name, v_email, v_fingerprint);

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.submit_product_review(integer, text, text, text, text, text) from public;
grant execute on function public.submit_product_review(integer, text, text, text, text, text) to anon, authenticated, service_role;

create or replace function public.get_product_reviews(
  p_product_slug text default 'zol-inlegzolen',
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with approved as (
    select id, rating, title, body, author_name, created_at
    from public.product_reviews
    where product_slug = p_product_slug and status = 'approved'
  )
  select jsonb_build_object(
    'count', (select count(*) from approved),
    'average', (select round(avg(rating)::numeric, 1) from approved),
    'distribution', jsonb_build_object(
      '5', (select count(*) from approved where rating = 5),
      '4', (select count(*) from approved where rating = 4),
      '3', (select count(*) from approved where rating = 3),
      '2', (select count(*) from approved where rating = 2),
      '1', (select count(*) from approved where rating = 1)
    ),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(latest) order by latest.created_at desc)
      from (
        select id, rating, title, body, author_name, created_at
        from approved
        order by created_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 100)
      ) as latest
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_product_reviews(text, integer) from public;
grant execute on function public.get_product_reviews(text, integer) to anon, authenticated, service_role;
