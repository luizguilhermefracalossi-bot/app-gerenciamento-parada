import { randomUUID } from 'node:crypto';
import { createPool, transaction } from '../src/index.js';

const pool = createPool();
const issuer = process.env.OIDC_ISSUER ?? 'http://localhost:8080/realms/shutdown';
const users = [['planner','Planner Local'],['supervisor','Supervisor Local'],['operator','Operator Local'],['viewer','Viewer Local']] as const;
await transaction(pool, async (c) => {
  const ids = new Map<string,string>();
  for (const [subject,name] of users) { const id = randomUUID(); const r = await c.query<{id:string}>('INSERT INTO users(id,issuer,subject,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(issuer,subject) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id',[id,issuer,subject,name]); ids.set(subject,r.rows[0]!.id); }
  const shutdownId='00000000-0000-4000-8000-000000000201'; const planner=ids.get('planner')!;
  await c.query('INSERT INTO shutdowns(id,code,name,timezone,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[shutdownId,'CTE-02-DEMO','Parada CTE-02 DEMO','America/Sao_Paulo',planner]);
  for (const [subject,role] of [['planner','PLANNER'],['supervisor','SUPERVISOR'],['operator','OPERATOR'],['viewer','VIEWER']] as const) await c.query('INSERT INTO shutdown_members(shutdown_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[shutdownId,ids.get(subject),role]);
  const wbs1='00000000-0000-4000-8000-000000000211',wbs2='00000000-0000-4000-8000-000000000212';
  await c.query('INSERT INTO wbs_nodes(id,shutdown_id,code,name) VALUES($1,$2,$3,$4),($5,$2,$6,$7) ON CONFLICT DO NOTHING',[wbs1,shutdownId,'1.0','Caldeira',wbs2,'2.0','Casa de Filtros']);
  const cal='00000000-0000-4000-8000-000000000221'; await c.query('INSERT INTO calendars(id,shutdown_id,name,timezone) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[cal,shutdownId,'Operação','America/Sao_Paulo']);
  for (let day=0;day<7;day++) for (const [s,e] of [[0,60],[120,720],[780,1440]]) await c.query('INSERT INTO calendar_windows(id,calendar_id,weekday,start_minute,end_minute) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[randomUUID(),cal,day,s,e]);
  await c.query("INSERT INTO calendar_exceptions(id,calendar_id,local_date,is_working) VALUES($1,$2,'2026-12-25',false) ON CONFLICT DO NOTHING",[randomUUID(),cal]);
  const tasks=[['00000000-0000-4000-8000-000000000231',wbs1,'1.1','Isolamento'],['00000000-0000-4000-8000-000000000232',wbs1,'1.2','Inspeção'],['00000000-0000-4000-8000-000000000233',wbs1,'1.3','Reparo'],['00000000-0000-4000-8000-000000000234',wbs2,'2.1','Troca de mangas'],['00000000-0000-4000-8000-000000000235',wbs2,'2.2','Teste'],['00000000-0000-4000-8000-000000000236',wbs2,'2.3','Marco de liberação']];
  for (const [id,wbs,code,name] of tasks) await c.query('INSERT INTO activities(id,shutdown_id,wbs_id,code,name,is_milestone,planned_duration_minutes) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[id,shutdownId,wbs,code,name,code==='2.3',code==='2.3'?0:240]);
  const ds=[['231','232','FS'],['232','233','SS'],['233','234','FF'],['234','235','SF']]; for (const [a,b,type] of ds) await c.query('INSERT INTO dependencies(id,shutdown_id,predecessor_id,successor_id,type) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[randomUUID(),shutdownId,`00000000-0000-4000-8000-000000000${a}`,`00000000-0000-4000-8000-000000000${b}`,type]);
  const mech='00000000-0000-4000-8000-000000000241',crane='00000000-0000-4000-8000-000000000242'; for(const [id,code,name] of [[mech,'MEC','Equipe mecânica'],[crane,'CRN','Guindaste']] as const) await c.query('INSERT INTO resources(id,shutdown_id,code,name,capacity,calendar_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[id,shutdownId,code,name,'1',cal]);
  await c.query('INSERT INTO resource_memberships(resource_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[mech,ids.get('operator')]); await c.query('INSERT INTO allocations(id,shutdown_id,activity_id,resource_id,units) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[randomUUID(),shutdownId,'00000000-0000-4000-8000-000000000231',mech,'1']);
  await c.query('INSERT INTO blockers(id,shutdown_id,activity_id,kind,title,observed_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING',['00000000-0000-4000-8000-000000000251',shutdownId,'00000000-0000-4000-8000-000000000232','INFORMATIONAL','Aguardar liberação de área']);
}); await pool.end();
