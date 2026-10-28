import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=ts.transpileModule(readFileSync("app/profit-model.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function("exports",source)(exports);
const storeSources=Object.fromEntries(["netSales","platformFees","adSpend","sellerDiscounts","goodsCost","fulfilmentCost"].map(key=>[key,"source:"+key]));
test("store contribution uses exact cents and requires verified source for every input",()=>{
  const row={netSales:"1000.10",platformFees:"100.05",adSpend:"20.00",sellerDiscounts:"10.00",goodsCost:"300.01",fulfilmentCost:"50.00",verifiedAt:"2026-10-28T00:00:00Z",sourceRefs:storeSources};
  assert.equal(exports.storeContribution(row),"530.04");
  assert.equal(exports.storeContribution({...row,sourceRefs:{...storeSources,goodsCost:""}}),null);
  assert.equal(exports.storeContribution({...row,verifiedAt:null}),null);
});
test("internal value cannot be counted as department cash revenue",()=>{
  const row={projectKind:"internal",cashRevenue:"0.00",laborCost:"100.00",toolCost:"5.00",outsourcedCost:"0.00",otherCost:"0.00",internalValue:"500.00",hours:"10.00",verifiedAt:"2026-10-28T00:00:00Z",sourceRefs:Object.fromEntries(["cashRevenue","laborCost","toolCost","outsourcedCost","otherCost"].map(key=>[key,"source:"+key]))};
  assert.equal(exports.departmentContribution(row),"-105.00");
  assert.equal(exports.departmentContribution({...row,cashRevenue:"500.00"}),null);
});
