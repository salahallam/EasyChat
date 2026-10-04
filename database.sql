-- ============================================================
-- EasyChat — CLEAN / RESET DATABASE
-- WARNING: this removes EasyChat public tables/data and the
-- EasyChat chat-files bucket contents from THIS Supabase project.
-- It does NOT delete users from Supabase Auth.
-- Run this whole file once in Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- CLEAN OLD EASYCHAT OBJECTS ----------
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.notifications cascade;
drop table if exists public.blocks cascade;
drop table if exists public.contacts cascade;
drop table if exists public.message_reads cascade;
drop table if exists public.message_reactions cascade;
drop table if exists public.messages cascade;
drop table if exists public.chat_members cascade;
drop table if exists public.chats cascade;
drop table if exists public.profiles cascade;

drop function if exists public.notify_new_message() cascade;
drop function if exists public.mark_chat_read(uuid) cascade;
drop function if exists public.create_group_chat(text, uuid[]) cascade;
drop function if exists public.create_direct_chat(uuid) cascade;
drop function if exists public.is_chat_member(uuid, uuid) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;

-- IMPORTANT:
-- Supabase does not allow direct DELETE from storage.objects/storage.buckets.
-- We therefore leave existing Storage objects untouched here.
-- The bucket is created below if it does not already exist.

-- ---------- TABLES ----------
create table public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default 'EasyChat User',
 username text unique,
 phone text unique,
 avatar_url text,
 bio text not null default '',
 is_online boolean not null default false,
 last_seen timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.chats(
 id uuid primary key default gen_random_uuid(),
 type text not null check(type in ('direct','group')),
 title text,
 avatar_url text,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.chat_members(
 chat_id uuid not null references public.chats(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null default 'member' check(role in ('member','admin','owner')),
 joined_at timestamptz not null default now(),
 last_read_at timestamptz,
 muted boolean not null default false,
 primary key(chat_id,user_id)
);

create table public.messages(
 id uuid primary key default gen_random_uuid(),
 chat_id uuid not null references public.chats(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete restrict,
 body text not null default '',
 message_type text not null default 'text'
   check(message_type in ('text','image','file','audio','system')),
 file_path text,
 file_name text,
 file_size bigint,
 mime_type text,
 reply_to uuid references public.messages(id) on delete set null,
 created_at timestamptz not null default now(),
 edited_at timestamptz,
 deleted_at timestamptz,
 check(length(trim(body)) between 0 and 10000),
 check(message_type <> 'text' or length(trim(body)) between 1 and 10000)
);

create table public.message_reactions(
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 reaction text not null check(length(reaction) between 1 and 20),
 created_at timestamptz not null default now(),
 primary key(message_id,user_id,reaction)
);

create table public.message_reads(
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(message_id,user_id)
);

create table public.contacts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 contact_id uuid not null references public.profiles(id) on delete cascade,
 nickname text,
 created_at timestamptz not null default now(),
 primary key(owner_id,contact_id),
 check(owner_id <> contact_id)
);

create table public.blocks(
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 check(blocker_id <> blocked_id)
);

create table public.notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete set null,
 type text not null check(type in ('message','mention','group_invite','system')),
 chat_id uuid references public.chats(id) on delete cascade,
 message_id uuid references public.messages(id) on delete cascade,
 title text not null,
 body text not null default '',
 is_read boolean not null default false,
 created_at timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index idx_chat_members_user on public.chat_members(user_id);
create index idx_chat_members_chat on public.chat_members(chat_id);
create index idx_messages_chat_created on public.messages(chat_id,created_at);
create index idx_messages_sender on public.messages(sender_id);
create index idx_reads_message on public.message_reads(message_id);
create index idx_notifications_user_created on public.notifications(user_id,created_at desc);
create index idx_contacts_owner on public.contacts(owner_id);
create index idx_blocks_blocker on public.blocks(blocker_id);

-- ---------- FUNCTIONS / TRIGGERS ----------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger chats_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, phone)
  values(
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(split_part(coalesce(new.email,''),'@',1),''),
      'EasyChat User'
    ),
    new.phone
  )
  on conflict(id) do update
    set phone = excluded.phone;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.is_chat_member(
  target_chat uuid,
  target_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.chat_members
    where chat_id = target_chat
      and user_id = target_user
  );
$$;

create function public.create_direct_chat(other_user_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  c uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if other_user_id = auth.uid() then
    raise exception 'Cannot chat with yourself';
  end if;

  if exists(
    select 1 from public.blocks
    where blocker_id = other_user_id
      and blocked_id = auth.uid()
  ) then
    raise exception 'This user is unavailable';
  end if;

  select a.chat_id into c
  from public.chat_members a
  join public.chat_members b on b.chat_id = a.chat_id
  join public.chats ch on ch.id = a.chat_id
  where a.user_id = auth.uid()
    and b.user_id = other_user_id
    and ch.type = 'direct'
  limit 1;

  if c is not null then
    return c;
  end if;

  insert into public.chats(type,created_by)
  values('direct',auth.uid())
  returning id into c;

  insert into public.chat_members(chat_id,user_id,role)
  values
    (c,auth.uid(),'member'),
    (c,other_user_id,'member');

  return c;
end;
$$;

create function public.create_group_chat(
  group_title text,
  member_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  c uuid;
  uid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(group_title)) < 1 then
    raise exception 'Group name is required';
  end if;

  insert into public.chats(type,title,created_by)
  values('group',trim(group_title),auth.uid())
  returning id into c;

  insert into public.chat_members(chat_id,user_id,role)
  values(c,auth.uid(),'owner');

  foreach uid in array member_ids loop
    if uid is not null and uid <> auth.uid() then
      insert into public.chat_members(chat_id,user_id,role)
      values(c,uid,'member')
      on conflict do nothing;
    end if;
  end loop;

  return c;
end;
$$;

create function public.mark_chat_read(target_chat uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.chat_members
  set last_read_at = now()
  where chat_id = target_chat
    and user_id = auth.uid();

  insert into public.message_reads(message_id,user_id,read_at)
  select m.id,auth.uid(),now()
  from public.messages m
  where m.chat_id = target_chat
    and m.sender_id <> auth.uid()
    and m.deleted_at is null
  on conflict(message_id,user_id)
  do update set read_at = excluded.read_at;
end;
$$;

create function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id is null then
    return new;
  end if;

  insert into public.notifications(
    user_id,actor_id,type,chat_id,message_id,title,body
  )
  select
    cm.user_id,
    new.sender_id,
    'message',
    new.chat_id,
    new.id,
    (
      select coalesce(full_name,'New message')
      from public.profiles
      where id = new.sender_id
    ),
    case
      when new.message_type = 'text' then left(new.body,180)
      else 'Sent an attachment'
    end
  from public.chat_members cm
  where cm.chat_id = new.chat_id
    and cm.user_id <> new.sender_id
    and cm.muted = false;

  update public.chats
  set updated_at = now()
  where id = new.chat_id;

  return new;
end;
$$;

create trigger messages_after_insert
after insert on public.messages
for each row execute function public.notify_new_message();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_reads enable row level security;
alter table public.contacts enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select
on public.profiles for select to authenticated
using (true);

create policy profiles_insert
on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy profiles_update
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy chats_select
on public.chats for select to authenticated
using (public.is_chat_member(id));

create policy chats_insert
on public.chats for insert to authenticated
with check (created_by = auth.uid());

create policy chats_update
on public.chats for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy members_select
on public.chat_members for select to authenticated
using (public.is_chat_member(chat_id));

create policy members_insert
on public.chat_members for insert to authenticated
with check (
  user_id = auth.uid()
  or exists(
    select 1
    from public.chat_members x
    where x.chat_id = chat_members.chat_id
      and x.user_id = auth.uid()
      and x.role in ('owner','admin')
  )
);

create policy members_update
on public.chat_members for update to authenticated
using (
  exists(
    select 1
    from public.chat_members x
    where x.chat_id = chat_members.chat_id
      and x.user_id = auth.uid()
      and x.role in ('owner','admin')
  )
)
with check (true);

create policy members_delete
on public.chat_members for delete to authenticated
using (
  user_id = auth.uid()
  or exists(
    select 1
    from public.chat_members x
    where x.chat_id = chat_members.chat_id
      and x.user_id = auth.uid()
      and x.role in ('owner','admin')
  )
);

create policy messages_select
on public.messages for select to authenticated
using (public.is_chat_member(chat_id));

create policy messages_insert
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_chat_member(chat_id)
);

create policy messages_update
on public.messages for update to authenticated
using (
  sender_id = auth.uid()
  and public.is_chat_member(chat_id)
)
with check (sender_id = auth.uid());

create policy messages_delete
on public.messages for delete to authenticated
using (sender_id = auth.uid());

create policy reactions_select
on public.message_reactions for select to authenticated
using (
  exists(
    select 1 from public.messages m
    where m.id = message_id
      and public.is_chat_member(m.chat_id)
  )
);

create policy reactions_insert
on public.message_reactions for insert to authenticated
with check (
  user_id = auth.uid()
  and exists(
    select 1 from public.messages m
    where m.id = message_id
      and public.is_chat_member(m.chat_id)
  )
);

create policy reactions_delete
on public.message_reactions for delete to authenticated
using (user_id = auth.uid());

create policy reads_select
on public.message_reads for select to authenticated
using (
  exists(
    select 1 from public.messages m
    where m.id = message_id
      and public.is_chat_member(m.chat_id)
  )
);

create policy reads_insert
on public.message_reads for insert to authenticated
with check (
  user_id = auth.uid()
  and exists(
    select 1 from public.messages m
    where m.id = message_id
      and public.is_chat_member(m.chat_id)
  )
);

create policy reads_update
on public.message_reads for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy contacts_all
on public.contacts for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy blocks_all
on public.blocks for all to authenticated
using (blocker_id = auth.uid())
with check (blocker_id = auth.uid());

create policy notifications_select
on public.notifications for select to authenticated
using (user_id = auth.uid());

create policy notifications_update
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy notifications_delete
on public.notifications for delete to authenticated
using (user_id = auth.uid());

-- ---------- PRIVILEGES ----------
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;

grant execute on function public.is_chat_member(uuid,uuid) to authenticated;
grant execute on function public.create_direct_chat(uuid) to authenticated;
grant execute on function public.create_group_chat(text,uuid[]) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- ---------- STORAGE ----------
-- Supabase protects storage.objects from direct SQL deletion.
-- We only create/update the bucket and manage its RLS policies here.
drop policy if exists storage_chat_read on storage.objects;
drop policy if exists storage_chat_insert on storage.objects;
drop policy if exists storage_chat_delete on storage.objects;

insert into storage.buckets(id,name,public)
values('chat-files','chat-files',false)
on conflict(id) do update set public = false;

create policy storage_chat_read
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-files'
  and exists(
    select 1
    from public.chat_members cm
    where cm.user_id = auth.uid()
      and cm.chat_id::text = split_part(name,'/',1)
  )
);

create policy storage_chat_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and exists(
    select 1
    from public.chat_members cm
    where cm.user_id = auth.uid()
      and cm.chat_id::text = split_part(name,'/',1)
  )
);

create policy storage_chat_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and owner_id = auth.uid()::text
);

-- ---------- REALTIME ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chats;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.message_reactions;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.message_reads;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

alter table public.messages replica identity full;

-- ---------- FINISHED ----------
select 'EasyChat database reset and created successfully (v3).' as status;
