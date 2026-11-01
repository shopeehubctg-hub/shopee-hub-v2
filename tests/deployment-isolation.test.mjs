import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';

const require=createRequire(import.meta.url);
const {build}=await import(pathToFileURL(require.resolve('esbuild',{paths:[dirname(require.resolve('vite'))]})));
async function bundled(entry){
 const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'server-only',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'stub'}));build.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'',loader:'js'}));}}]});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const isolation=await bundled('app/deployment-isolation.ts');
const history=await bundled('app/api/packages/history-sync.ts');
const stage='ubjfuveoqbvouryldqfu';const prod='zwnmonnbmqncwoytdigd';
const key='sb_secret_for_isolation_test_only';
const sha=createHash('sha256').update(key).digest('hex');
const jwt=(claims)=>['e30',Buffer.from(JSON.stringify(claims)).toString('base64url'),'signature'].join('.');
const stageEnv={VERCEL:'1',VERCEL_ENV:'preview',SUPABASE_URL:`https://${stage}.supabase.co`,SUPABASE_SECRET_KEY:key,
 STAGING_SUPABASE_SECRET_SHA256:sha,DATABASE_URL:`postgresql://postgres.${stage}:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`};

test('Preview and explicit local Staging require the staging project, database and opaque key fingerprint',()=>{
 assert.equal(isolation.assertDeploymentIsolation(stageEnv),'staging');
 assert.equal(isolation.assertDeploymentIsolation({...stageEnv,VERCEL:undefined,VERCEL_ENV:undefined,DASHBOARD_ENVIRONMENT:'staging'}),'staging');
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,SUPABASE_URL:`https://${prod}.supabase.co`}),/wrong project/);
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,DATABASE_URL:`postgresql://postgres.${prod}:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`}),/database URL points to the wrong project/);
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,STAGING_SUPABASE_SECRET_SHA256:'0'.repeat(64)}),/fingerprint/);
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,DASHBOARD_ENVIRONMENT:'production'}),/Preview environment must use Staging/);
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,VERCEL_ENV:undefined}),/Deployment environment is missing/);
});

test('Production requires the production ref, while ordinary local tests remain unbound',()=>{
 assert.equal(isolation.assertDeploymentIsolation({VERCEL:'1',VERCEL_ENV:'production',SUPABASE_URL:`https://${prod}.supabase.co`,SUPABASE_SECRET_KEY:key,DATABASE_URL:`postgres://postgres@db.${prod}.supabase.co:5432/postgres`}), 'production');
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,VERCEL_ENV:'production',DASHBOARD_ENVIRONMENT:'staging'}),/Production environment/);
 assert.equal(isolation.assertDeploymentIsolation({SUPABASE_URL:`https://${prod}.supabase.co`,DATABASE_URL:'postgres://local/test'}),'local');
});

test('a Stage service-role JWT works without a fingerprint, but any supplied fingerprint must match',()=>{
 const serviceKey=jwt({ref:stage,role:'service_role'});
 assert.equal(isolation.assertDeploymentIsolation({...stageEnv,SUPABASE_SECRET_KEY:serviceKey,STAGING_SUPABASE_SECRET_SHA256:undefined}),'staging');
 assert.equal(isolation.assertDeploymentIsolation({...stageEnv,SUPABASE_SECRET_KEY:serviceKey,STAGING_SUPABASE_SECRET_SHA256:createHash('sha256').update(serviceKey).digest('hex')}),'staging');
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,SUPABASE_SECRET_KEY:serviceKey,STAGING_SUPABASE_SECRET_SHA256:sha}),/fingerprint/);
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,SUPABASE_SECRET_KEY:serviceKey,STAGING_SUPABASE_SECRET_SHA256:''}),/fingerprint/);
});

test('opaque Stage keys still need a matching fingerprint',()=>{
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,STAGING_SUPABASE_SECRET_SHA256:undefined}),/fingerprint/);
 assert.equal(isolation.assertDeploymentIsolation(stageEnv),'staging');
});

test('JWTs with the wrong project, missing ref, or non-service role fail even if their fingerprints match',()=>{
 for(const claims of [{ref:prod,role:'service_role'},{role:'service_role'},{ref:stage,role:'anon'}]){
  const serviceKey=jwt(claims);
  assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,SUPABASE_SECRET_KEY:serviceKey,STAGING_SUPABASE_SECRET_SHA256:createHash('sha256').update(serviceKey).digest('hex')}),/wrong project or role/);
 }
 const malformed='e30.invalid.signature';
 assert.throws(()=>isolation.assertDeploymentIsolation({...stageEnv,SUPABASE_SECRET_KEY:malformed,STAGING_SUPABASE_SECRET_SHA256:createHash('sha256').update(malformed).digest('hex')}),/wrong project or role/);
});

test('Staging password recovery is closed except for an explicit recipient allowlist',()=>{
 assert.equal(isolation.stagingRecipientAllowed('user@example.test',stageEnv),false);
 assert.equal(isolation.stagingRecipientAllowed('TEST@EXAMPLE.TEST',{...stageEnv,STAGING_AUTH_RECIPIENT_ALLOWLIST:'other@example.test, test@example.test'}),true);
 assert.throws(()=>isolation.stagingRecipientAllowed('test@example.test',{...stageEnv,SUPABASE_URL:`https://${prod}.supabase.co`,STAGING_AUTH_RECIPIENT_ALLOWLIST:'test@example.test'}),/wrong project/);
});

test('Staging never fetches a real Package History webhook, even if configured',async()=>{
 const names=['VERCEL','VERCEL_ENV','DASHBOARD_ENVIRONMENT','SUPABASE_URL','SUPABASE_SECRET_KEY','STAGING_SUPABASE_SECRET_SHA256','DATABASE_URL','GOOGLE_SHEETS_HISTORY_WEBHOOK_URL','GOOGLE_SHEETS_HISTORY_SECRET'];
 const saved=new Map(names.map(name=>[name,process.env[name]]));const oldFetch=globalThis.fetch;let fetches=0;
 try{
  for(const [name,value] of Object.entries(stageEnv))process.env[name]=value;
  process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL='https://script.google.com/macros/s/production/exec';
  process.env.GOOGLE_SHEETS_HISTORY_SECRET='synthetic';
  globalThis.fetch=async()=>{fetches++;throw Error('External write attempted');};
  assert.deepEqual(await history.syncHistoryToGoogleSheet({changeId:'test-v1'}),{status:'synced'});
  delete process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL;
  delete process.env.GOOGLE_SHEETS_HISTORY_SECRET;
  assert.deepEqual(await history.syncHistoryToGoogleSheet({changeId:'test-v1'}),{status:'synced'});
  process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL='staging://package-history-receipt';
  assert.deepEqual(await history.syncHistoryToGoogleSheet({changeId:'test-v1'}),{status:'synced'});
  assert.equal(fetches,0);
 }finally{globalThis.fetch=oldFetch;for(const [name,value] of saved){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
