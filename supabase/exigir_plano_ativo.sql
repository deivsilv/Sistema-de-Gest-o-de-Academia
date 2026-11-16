begin;

-- Consulta somente o plano do aluno autenticado. A função privada evita ciclos
-- entre as políticas de planos, matrículas e perfis; não aceita IDs de terceiros.
create or replace function private.aluno_tem_plano_ativo()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.perfil_atual() = 'ALUNO', false)
    and exists (
      select 1 from public.matriculas m
      join public.planos p on p.id = m.plano_id
      where m.aluno_id = (select auth.uid()) and m.ativa and p.ativo
        and m.data_inicio <= current_date
        and (m.data_fim is null or m.data_fim >= current_date)
    );
$$;
revoke all on function private.aluno_tem_plano_ativo() from public, anon, authenticated;
grant execute on function private.aluno_tem_plano_ativo() to authenticated;

alter policy treinos_aluno_leitura on public.treinos
using (
  (select private.perfil_atual()) = 'ALUNO'
  and aluno_id = (select auth.uid()) and ativo
  and (select private.aluno_em_dia())
  and (select private.aluno_tem_plano_ativo())
);

commit;
