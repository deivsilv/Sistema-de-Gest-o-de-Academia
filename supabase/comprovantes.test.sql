begin;
do $$
declare a uuid; s uuid; old_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid(); rej_id uuid:=gen_random_uuid(); manual_id uuid:=gen_random_uuid(); payment_id uuid; denied boolean; count_before bigint;
begin
 select id into a from public.perfis where perfil='ADMIN' and ativo limit 1;
 select id into s from public.perfis where perfil='PERSONAL' and ativo limit 1;
 if a is null or s is null then raise exception 'Contas existentes insuficientes para o teste transacional.'; end if;
 -- Modificacao temporaria, nao visivel a outras transacoes, revertida pelo ROLLBACK.
 update public.perfis set perfil='ALUNO' where id=s;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.comprovantes(id,aluno_id,valor,data_pagamento,arquivo_path,mime_type,status)
 values(old_id,s,10,current_date-31,'teste/'||old_id,'application/pdf','PENDENTE');
 perform public.analisar_comprovante(old_id,true);
 perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
 if private.aluno_em_dia() then raise exception 'Pagamento antigo liberou acesso indevidamente.'; end if;
 denied:=false;begin perform public.analisar_comprovante(old_id,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Aluno conseguiu analisar comprovante.'; end if;
 denied:=false;begin perform public.registrar_pagamento(gen_random_uuid(),s,10,current_date,'DINHEIRO');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Aluno conseguiu registrar pagamento.'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.comprovantes(id,aluno_id,valor,data_pagamento,arquivo_path,mime_type,status)
 values(new_id,s,100,current_date,'teste/'||new_id,'application/pdf','PENDENTE'),(rej_id,s,100,current_date,'teste/'||rej_id,'image/png','PENDENTE');
 payment_id:=public.analisar_comprovante(new_id,true);
 if payment_id is null or (select count(*) from public.pagamentos where comprovante_id=new_id)<>1 then raise exception 'Aprovacao nao registrou exatamente um pagamento.'; end if;
 denied:=false;begin perform public.analisar_comprovante(new_id,true);exception when others then denied:=true;end;
 if not denied then raise exception 'Aprovacao duplicada permitida.'; end if;
 denied:=false;begin perform public.analisar_comprovante(rej_id,false,'');exception when others then denied:=true;end;
 if not denied then raise exception 'Rejeicao sem motivo permitida.'; end if;
 select count(*) into count_before from public.pagamentos where aluno_id=s;
 perform public.analisar_comprovante(rej_id,false,'Comprovante nao corresponde ao recebimento.');
 if (select count(*) from public.pagamentos where aluno_id=s)<>count_before then raise exception 'Rejeicao gerou pagamento.'; end if;
 perform public.registrar_pagamento(manual_id,s,50,current_date,'DINHEIRO');
 perform public.registrar_pagamento(manual_id,s,50,current_date,'DINHEIRO');
 if (select count(*) from public.pagamentos where id=manual_id)<>1 then raise exception 'Registro presencial duplicado.'; end if;
 denied:=false;begin perform public.registrar_pagamento(gen_random_uuid(),s,50,current_date+1,'DINHEIRO');exception when others then denied:=true;end;
 if not denied then raise exception 'Data futura permitida.'; end if;
 if has_table_privilege('authenticated','public.comprovantes','UPDATE') then raise exception 'Cliente pode alterar diretamente status de comprovante.'; end if;
 if (select public from storage.buckets where id='comprovantes') then raise exception 'Bucket publico.'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
 if not private.aluno_em_dia() then raise exception 'Pagamento atual nao liberou acesso.'; end if;
 -- Testa consulta com RLS real no papel authenticated.
 execute 'set local role authenticated';
 if (select count(*) from public.comprovantes where aluno_id<>auth.uid())<>0 then raise exception 'Comprovante de outro usuario exposto.'; end if;
 execute 'reset role';
end; $$;
rollback;
select 'Aprovacao unica, rejeicao, motivo, pagamento presencial idempotente, data futura, janela de 30 dias, isolamento RLS e bucket privado: OK. Testes revertidos.' as resultado;
