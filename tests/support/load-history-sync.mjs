import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url);
const {build}=await import(pathToFileURL(require.resolve('esbuild',{paths:[dirname(require.resolve('vite'))]})));

export async function loadHistorySync(){
 const result=await build({entryPoints:['app/api/packages/history-sync.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{
  name:'server-only',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'stub'}));build.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'',loader:'js'}));}
 }]});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
