begin;
create table public.comprovantes (
 id uuid primary key default gen_random_uuid(),
 aluno_id uuid not null references public.perfis(id) on delete restrict,
 valor numeric(12,2) not null check(valor>0),
 data_pagamento date not null check(data_pagamento<=current_date),
 arquivo_path text not null unique,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','application/pdf')),
 status text not null default 'RASCUNHO' check(status in ('RASCUNHO','PENDENTE','APROVADO','REJEITADO')),
 motivo text,
 analisado_por uuid references public.perfis(id) on delete restrict,
 analisado_em timestamptz,
 criado_em timestamptz not null default now(),
 check ((status in ('RASCUNHO','PENDENTE') and analisado_por is null and analisado_em is null and motivo is null) or (status='APROVADO' and analisado_por is not null and analisado_em is not null and motivo is null) or (status='REJEITADO' and analisado_por is not null and analisado_em is not null and length(btrim(motivo))>=5))
);
create index comprovantes_aluno_idx on public.comprovantes(aluno_id,criado_em desc);
create index comprovantes_pendentes_idx on public.comprovantes(criado_em) where status='PENDENTE';
create index comprovantes_analista_idx on public.comprovantes(analisado_por);
alter table public.pagamentos add column comprovante_id uuid unique references public.comprovantes(id) on delete restrict;
alter table public.pagamentos add column forma text not null default 'OUTRO' check(forma in ('PIX','DINHEIRO','CARTAO','OUTRO'));
alter table public.comprovantes enable row level security;
create policy comprovantes_leitura on public.comprovantes for select to authenticated using (
 ((select private.perfil_atual())='ADMIN' and status<>'RASCUNHO') or ((select private.perfil_atual())='ALUNO' and aluno_id=(select auth.uid()))
);
revoke all on public.comprovantes from public,anon,authenticated;
grant select on public.comprovantes to authenticated;
grant select,insert,update on public.comprovantes to service_role;
create trigger preservar_comprovantes before delete on public.comprovantes for each row execute function private.impedir_exclusao();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('comprovantes','comprovantes',false,5242880,array['image/jpeg','image/png','application/pdf']);
create policy comprovantes_arquivo_envio on storage.objects for insert to authenticated with check(
 bucket_id='comprovantes' and (select private.perfil_atual())='ALUNO' and exists(
 select 1 from public.comprovantes c where c.arquivo_path=name and c.aluno_id=(select auth.uid()) and c.status='RASCUNHO')
);
create policy comprovantes_arquivo_leitura on storage.objects for select to authenticated using(
 bucket_id='comprovantes' and exists(select 1 from public.comprovantes c where c.arquivo_path=name and
 (((select private.perfil_atual())='ALUNO' and c.aluno_id=(select auth.uid())) or ((select private.perfil_atual())='ADMIN' and c.status<>'RASCUNHO')))
);
-- Sem politica de overwrite/delete: um arquivo enviado nao pode ser trocado durante a analise.
create function public.iniciar_comprovante(p_valor numeric,p_data date,p_mime text)
returns public.comprovantes language plpgsql security definer set search_path='' as $$
declare v public.comprovantes; v_id uuid:=gen_random_uuid();
begin
 if private.perfil_atual() is distinct from 'ALUNO' then raise exception 'Somente alunos ativos enviam comprovantes.' using errcode='42501'; end if;
 if p_valor is null or p_valor<=0 or p_data is null or p_data>current_date or p_mime is null or p_mime not in ('image/jpeg','image/png','application/pdf') then raise exception 'Valor, data ou tipo de arquivo invalido.'; end if;
 insert into public.comprovantes(id,aluno_id,valor,data_pagamento,arquivo_path,mime_type)
 values(v_id,auth.uid(),p_valor,p_data,auth.uid()::text||'/'||v_id::text,p_mime) returning * into v;
 return v;
end; $$;
create function public.enviar_comprovante(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.comprovantes;
begin
 if private.perfil_atual() is distinct from 'ALUNO' then raise exception 'Acesso negado.' using errcode='42501'; end if;
 select * into v from public.comprovantes where id=p_id and aluno_id=auth.uid() for update;
 if not found then raise exception 'Comprovante nao encontrado.'; end if;
 if v.status='PENDENTE' then return; end if;
 if v.status<>'RASCUNHO' then raise exception 'Este comprovante ja foi analisado.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='comprovantes' and name=v.arquivo_path and metadata->>'mimetype'=v.mime_type and (metadata->>'size')::bigint between 1 and 5242880) then raise exception 'Arquivo ainda nao enviado ou invalido. Selecione um arquivo valido e tente outro envio.'; end if;
 update public.comprovantes set status='PENDENTE' where id=p_id;
end; $$;
create function public.analisar_comprovante(p_id uuid,p_aprovar boolean,p_motivo text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.comprovantes; v_pagamento uuid;
begin
 if private.perfil_atual() is distinct from 'ADMIN' then raise exception 'Apenas administradores podem analisar.' using errcode='42501'; end if;
 if p_aprovar is null then raise exception 'Informe a decisao.'; end if;
 select * into v from public.comprovantes where id=p_id for update;
 if not found or v.status<>'PENDENTE' then raise exception 'Comprovante nao encontrado ou ja analisado.'; end if;
 if p_aprovar then
  perform 1 from public.perfis where id=v.aluno_id and perfil='ALUNO' and ativo for share;
  if not found then raise exception 'O aluno esta inativo. Reative o cadastro antes de aprovar.'; end if;
  insert into public.pagamentos(aluno_id,valor,data_pagamento,status,registrado_por,comprovante_id,forma)
  values(v.aluno_id,v.valor,v.data_pagamento,'PAGO',auth.uid(),v.id,'PIX') returning id into v_pagamento;
 else
  if coalesce(length(btrim(p_motivo)),0)<5 or length(p_motivo)>1000 then raise exception 'Informe um motivo de 5 a 1000 caracteres.'; end if;
 end if;
 update public.comprovantes set status=case when p_aprovar then 'APROVADO' else 'REJEITADO' end,
 motivo=case when p_aprovar then null else btrim(p_motivo) end,analisado_por=auth.uid(),analisado_em=now() where id=p_id;
 return v_pagamento;
end; $$;
create function public.registrar_pagamento(p_id uuid,p_aluno_id uuid,p_valor numeric,p_data date,p_forma text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.pagamentos;
begin
 if private.perfil_atual() is distinct from 'ADMIN' then raise exception 'Apenas administradores registram pagamentos.' using errcode='42501'; end if;
 if p_id is null or p_valor is null or p_valor<=0 or p_data is null or p_data>current_date or p_forma is null or p_forma not in ('PIX','DINHEIRO','CARTAO','OUTRO') then raise exception 'Valor, data ou forma de pagamento invalida.'; end if;
 perform 1 from public.perfis where id=p_aluno_id and perfil='ALUNO' and ativo for share;
 if not found then raise exception 'Selecione um aluno ativo.'; end if;
 insert into public.pagamentos(id,aluno_id,valor,data_pagamento,status,registrado_por,forma)
 values(p_id,p_aluno_id,p_valor,p_data,'PAGO',auth.uid(),p_forma) on conflict(id) do nothing;
 select * into v from public.pagamentos where id=p_id;
 if v.aluno_id<>p_aluno_id or v.valor<>p_valor or v.data_pagamento<>p_data or v.registrado_por<>auth.uid() or v.forma<>p_forma or v.comprovante_id is not null then raise exception 'Este registro ja existe com outros dados.'; end if;
 return v.id;
end; $$;
revoke all on function public.iniciar_comprovante(numeric,date,text), public.enviar_comprovante(uuid), public.analisar_comprovante(uuid,boolean,text), public.registrar_pagamento(uuid,uuid,numeric,date,text) from public,anon,authenticated;
grant execute on function public.iniciar_comprovante(numeric,date,text), public.enviar_comprovante(uuid), public.analisar_comprovante(uuid,boolean,text), public.registrar_pagamento(uuid,uuid,numeric,date,text) to authenticated;
alter table public.comprovantes add constraint comprovantes_valor_finito check(valor <> 'NaN'::numeric);
alter table public.pagamentos add constraint pagamentos_valor_finito check(valor <> 'NaN'::numeric);
commit;
