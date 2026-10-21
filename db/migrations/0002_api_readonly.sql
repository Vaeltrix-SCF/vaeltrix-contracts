-- VX-704: API connections assume a role with SELECT only.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vaeltrix_api_readonly') then
    create role vaeltrix_api_readonly nologin;
  end if;
end $$;
grant usage on schema public to vaeltrix_api_readonly;
grant select on all tables in schema public to vaeltrix_api_readonly;
alter default privileges in schema public grant select on tables to vaeltrix_api_readonly;
