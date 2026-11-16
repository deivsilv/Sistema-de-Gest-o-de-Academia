import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPayments, unpaidStudents} from '../src/financeReports.ts';
import type {AcademyPerson, Payment} from '../src/academy.ts';
const today='2026-11-14';
const student=(id:number, active=true):AcademyPerson=>({id,name:`Aluno ${id}`,email:'',active,plan:'Mensal'});
const payment=(studentId:number,date:string):Payment=>({id:`${studentId}-${date}`,studentId,date,amount:100,status:'PAGO'});

test('combina aluno e período inclusivo, sem alterar histórico original',()=>{
  const rows=[payment(1,'2026-11-10'),payment(2,'2026-11-11'),payment(1,'2026-11-14'),payment(1,'2026-11-09')];
  const result=filterPayments(rows,'1','2026-11-10','2026-11-14');
  assert.deepEqual(result.map(p=>p.date),['2026-11-14','2026-11-10']);
  assert.equal(rows[0].date,'2026-11-10');
});
test('permite todos os alunos e apenas um limite de data',()=>{
  const rows=[payment(1,'2026-11-10'),payment(2,'2026-11-14')];
  assert.equal(filterPayments(rows,'','','').length,2);
  assert.equal(filterPayments(rows,'','','2026-11-10').length,1);
  assert.equal(filterPayments(rows,'','2026-11-14','').length,1);
});
test('intervalo invertido não retorna registros',()=>assert.deepEqual(filterPayments([payment(1,today)],'','2026-11-14','2026-11-10'),[]));
test('RF13 inclui primeiro pagamento e análise; exclui inativos e pagos há exatamente 30 dias',()=>{
  const students=[student(1),student(2),student(3),student(4,false),student(5)];
  students[4].financialStatus='UNDER_REVIEW';
  const rows=[payment(2,'2026-10-14'),payment(2,'2026-09-01'),payment(3,'2026-10-15'),payment(4,'2026-10-01')];
  assert.deepEqual(unpaidStudents(students,rows,today).map(r=>[r.student.id,r.lastPayment]),[
    [1,null],[2,'2026-10-14'],[5,null],
  ]);
});
test('pagamento futuro ou inválido não oculta pendência, nem vira último pagamento',()=>{
  const rows=[payment(1,'2026-11-15'),{...payment(1,today),amount:0},payment(2,today)];
  assert.deepEqual(unpaidStudents([student(1)],rows,today).map(r=>r.lastPayment),[null]);
});
