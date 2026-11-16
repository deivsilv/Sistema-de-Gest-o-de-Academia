begin;
-- Consulta interna limitada ao aluno autenticado; nao expoe uma lista de treinos.
-- SECURITY DEFINER e necessario aqui para evitar reentrada nas politicas de perfis.
create function private.personal_vinculado_ao_aluno(p_personal_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select coalesce(private.perfil_atual() = 'ALUNO', false)
   and private.aluno_em_dia()
   and exists (
     select 1 from public.treinos t
     where t.personal_id = p_personal_id
       and t.aluno_id = (select auth.uid())
       and t.ativo
   );
$$;
revoke all on function private.personal_vinculado_ao_aluno(uuid) from public, anon, authenticated;
grant execute on function private.personal_vinculado_ao_aluno(uuid) to authenticated;

alter policy perfis_leitura on public.perfis
using (
 id = (select auth.uid())
 or (select private.perfil_atual()) = 'ADMIN'
 or ((select private.perfil_atual()) = 'PERSONAL' and perfil = 'ALUNO' and ativo)
 or ((select private.perfil_atual()) = 'ALUNO' and perfil = 'PERSONAL'
     and private.personal_vinculado_ao_aluno(id))
);
commit;
