-- Staff transcribe an expert's supplied answer. Keep the operator's identity
-- out of the public answer and use the normal Circle answer triggers.
insert into public.permissions (module, action, description)
values ('crm', 'circle.expert_replies', 'Publish replies supplied by Circle experts')
on conflict (module, action) do nothing;

create table public.circle_expert_reply_submissions (
  answer_id uuid primary key references public.circle_answers(id) on delete cascade,
  submitted_by uuid not null,
  request_id uuid not null,
  submitted_at timestamptz not null default now(),
  unique (submitted_by, request_id)
);
alter table public.circle_expert_reply_submissions enable row level security;
revoke all on public.circle_expert_reply_submissions from public, anon, authenticated;

create function public.circle_reply_experts()
returns table (user_id uuid, username text, expert_title text)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.username, p.expert_title from public.circle_profiles p
  where auth.uid() is not null and public.circle_staff_can('crm.circle.expert_replies')
    and p.is_expert and p.expert_status = 'approved'
  order by p.username, p.user_id;
$$;

create function public.circle_publish_expert_reply(p_question uuid, p_expert uuid, p_body text, p_request uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  answer_text text := btrim(coalesce(p_body, ''));
  prior public.circle_answers%rowtype;
  answer_id uuid;
begin
  if actor is null or not public.circle_staff_can('crm.circle.expert_replies') then
    raise exception 'Circle expert reply permission required' using errcode = '42501';
  end if;
  if p_request is null or char_length(answer_text) < 2 then
    raise exception 'Enter the answer supplied by the expert';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_request::text, 0));
  select a.* into prior from public.circle_expert_reply_submissions s
    join public.circle_answers a on a.id = s.answer_id
    where s.submitted_by = actor and s.request_id = p_request;
  if found then
    if prior.question_id = p_question and prior.author_id = p_expert and prior.body = answer_text then
      return prior.id;
    end if;
    raise exception 'This submission was already used for another answer';
  end if;
  perform 1 from public.circle_questions where id = p_question and deleted_at is null for share;
  if not found then raise exception 'This question is no longer available'; end if;
  perform 1 from public.circle_profiles where user_id = p_expert and is_expert and expert_status = 'approved' for share;
  if not found then raise exception 'Choose a currently approved Circle expert'; end if;

  insert into public.circle_answers (question_id, author_id, body, is_expert)
    values (p_question, p_expert, answer_text, true) returning id into answer_id;
  insert into public.circle_expert_reply_submissions (answer_id, submitted_by, request_id)
    values (answer_id, actor, p_request);
  return answer_id;
end;
$$;

revoke all on function public.circle_reply_experts(), public.circle_publish_expert_reply(uuid,uuid,text,uuid) from public, anon;
grant execute on function public.circle_reply_experts(), public.circle_publish_expert_reply(uuid,uuid,text,uuid) to authenticated;
notify pgrst, 'reload schema';
