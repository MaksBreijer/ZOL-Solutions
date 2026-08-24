-- Keep the CMS-managed homepage story aligned with the public over-ons story.
do $$
declare
  affected_rows integer;
begin
  update public.site_content
  set value = 'In februari 2026 raakten Maks en Thijn aan de praat over podologische zolen. Voor Maks was hielpijn persoonlijk: hij had zelf de ziekte van Sever gehad. Vanuit hun ervaring als skibootfitters, gesprekken met podologen en een bestaand zoolontwerp bouwden ze aan een verkorte zool die demping met stabilisatie combineert.',
      updated_at = now()
  where content_key = 'home.story.lead'
    and page = 'home'
    and section = 'story';

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Expected one home.story.lead row, updated %', affected_rows;
  end if;
end
$$;
