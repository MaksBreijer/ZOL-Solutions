-- Beheerders mogen contactberichten verwijderen; de bestaande policy "admins manage contact messages" beperkt dit tot admins.
grant delete on public.contact_messages to authenticated;
