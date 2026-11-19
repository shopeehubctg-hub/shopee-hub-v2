import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const {outputFiles} = await build({entryPoints:['app/package-grid-model.ts'],write:false,bundle:true,platform:'node',format:'esm'});
const {editGridCells,indexGridProducts,clipboardRows, gridColumns, gridReview, pasteGrid} = await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].contents).toString('base64'));
const catalog = [{sku:'0001',name:'A Product'}, {sku:'0002',name:'Shared'}, {sku:'0003',name:'Shared'}];
const line = ['Starter','100','80','70','75','009','','','A Product','2'];
test('TSV handles spreadsheet quoting, CRLF, empty cells and offsets',()=>{
  assert.deepEqual(clipboardRows('"A ""kit"""\t\t1\r\n"Second\nkit"\t0\r\n'),[['A "kit"','','1'],['Second\nkit','0']]);
  const original = [{name:'Keep',Shopee:'007'}];
  const {rows} = pasteGrid(original,'MY','product',1,0,1,'100\t85\t70\t75\r\n200\t160\t120\t140');
  assert.equal(rows.length,2); assert.equal(rows[0].Shopee,'007');
  assert.equal(rows[0]['MY.normalLate'],'75'); assert.equal(rows[1]['MY.campaign'],'120');
  assert.deepEqual(original,[{name:'Keep',Shopee:'007'}]);
});
test('the 500-row and 100-item limits reject oversized pastes atomically',()=>{
  const text = Array.from({length:500},(_,i)=>'Package '+i).join('\n');
  assert.equal(pasteGrid([],'MY','product',1,0,0,text).rows.length,500);
  assert.throws(()=>pasteGrid([],'MY','product',1,1,0,text),/500/);
  const width=gridColumns('MY',100,'sku').length;
  assert.equal(pasteGrid([],'MY','sku',1,0,0,Array(width).fill('x').join('\t')).slots,100);
  assert.throws(()=>pasteGrid([],'MY','sku',1,0,1,Array(width).fill('x').join('\t')),/100/);
});
test('store products resolve by name or SKU, duplicates require disambiguation and new products retain both fields',()=>{
  const {rows}=pasteGrid([],'MY','product',1,0,0,line.join('\t'));
  const make=(key, extra={})=>gridReview([{...rows[0],'0.name':key,...extra},{}],'MY',1,catalog);
  assert.deepEqual(make('A Product').issues,[]);
  assert.equal(make('A Product').rows[0].items[0].sku,'0001');
  assert.equal(make('A Product').rows[0].skus.Shopee,'009');
  assert.equal(make('').rows.length,1); assert(make('Shared').issues.some(i=>i.message.includes('Several products')));
  assert.deepEqual(make('Shared',{'0.sku':'0003'}).issues,[]);
  assert(make('New Product').issues.length); assert.deepEqual(make('New Product',{'0.sku':'NEW'}).issues,[]);
  assert(make('A Product',{'0.sku':'0003'}).issues.some(i=>i.message.includes('does not match')));
  const {rows:skus}=pasteGrid([],'MY','sku',1,0,0,[...line.slice(0,8),'0001','2'].join('\t'));
  assert.equal(gridReview(skus,'MY',1,catalog).rows[0].items[0].name,'A Product');
});
test('multi-market columns retain each market price and additional pasted product slots',()=>{
  const source=[line[0],...line.slice(1,5),'50','45','40','42',...line.slice(5),'','Shared','1','0003'];
  const {rows,slots}=pasteGrid([],'MY+SG','product',1,0,0,source.join('\t'));
  assert.equal(slots,2);
  const result=gridReview(rows,'MY+SG',slots,catalog);
  assert.deepEqual(result.issues,[]);
  assert.equal(result.rows[0].prices.SG.normalLate,'42');
  assert.deepEqual(result.rows[0].items.map(i=>i.sku),['0001','0003']);
});

test('replacing a selected library item clears its old counterpart and preserves explicit pasted pairs',()=>{
  const library=indexGridProducts(catalog);
  const old={'0.name':'A Product','0.sku':'0001','0.qty':'3'};
  assert.equal(editGridCells(old,{'0.name':'Shared'},library)['0.sku'],'');
  assert.deepEqual(editGridCells(old,{'0.sku':'0003'},library),{'0.name':'Shared','0.sku':'0003','0.qty':'3'});
  assert.equal(editGridCells({}, {'0.name':'Shared','0.sku':'0002'},library)['0.sku'],'0002');
  const edited=pasteGrid([old],'MY','sku',20,0,8,'0002\t2',library);
  assert.deepEqual(edited.rows,[{'0.name':'Shared','0.sku':'0002','0.qty':'2'}]);
});
