-- Compare equivalent school-year typography without rewriting stored records.
create function public.section_school_year_key(value text) returns text
language sql immutable set search_path = '' as $$
  with cleaned as (
    select public.section_context_value(translate(coalesce(value,''), U&'\00A0\202F', '  ')) as value
  ), matched as (
    select value, regexp_match(value,
      '^(?:(?:s\.?[[:space:]]*y\.?|school year)[[:space:]]*)?([0-9]{4})[[:space:]]*[-‐‑‒–—―−／/][[:space:]]*([0-9]{4})$') as parts from cleaned
  ) select case when parts is null then value else parts[1] || '-' || parts[2] end from matched
$$;
revoke all on function public.section_school_year_key(text) from public, anon, authenticated;

create or replace function public.section_context_matches(c_grade text, c_year text, c_school text,
  s_grade text, s_year text, s_school text) returns boolean
language sql immutable set search_path = '' as $$
  select public.section_context_value(c_grade) = public.section_context_value(s_grade)
    and public.section_school_year_key(c_year) = public.section_school_year_key(s_year)
    and (public.section_context_value(c_school) = '' or public.section_context_value(s_school) = ''
      or public.section_context_value(c_school) = public.section_context_value(s_school))
$$;
