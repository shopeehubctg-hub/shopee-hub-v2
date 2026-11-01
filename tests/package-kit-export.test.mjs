import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { buildKitRows, KitExportError } from "../app/package-kit-export.ts";
import { makeKitWorkbook } from "../app/package-kit-workbook.ts";

const components=[
  {inventorySku:"FYGPB030",quantity:4},
  {inventorySku:"FYGPB010",quantity:2},
  {inventorySku:"FFYGMP15",quantity:5},
];

test("three platform SKUs export nine rows and a real BIFF8 workbook",()=>{
  const rows=buildKitRows([{id:"one",name:"B4F7",platforms:[
    {platform:"Shopee",packageSku:"FYOCTA03SP"},
    {platform:"Lazada",packageSku:"FYOCTA03LZ"},
    {platform:"TikTok Shop",packageSku:"FYOCTA03TT"},
  ],components}]);
  assert.equal(rows.length,9);
  assert.deepEqual(rows.slice(0,3),components.map(item=>({kitSku:"FYOCTA03SP",inventorySku:item.inventorySku,quantity:item.quantity,price:1})));
  const workbook=XLSX.read(makeKitWorkbook(rows),{type:"array"});
  assert.deepEqual(workbook.SheetNames,["Sheet1","Kit Products"]);
  const sheet=XLSX.utils.sheet_to_json(workbook.Sheets["Kit Products"],{header:1});
  assert.deepEqual(sheet[0],["Kit SKU*","Inventory SKU*","Quantity*","Price"]);
  assert.equal(sheet.length,10);
  assert.ok(sheet.slice(1).every(row=>typeof row[2]==="number"&&row[3]===1));
});

test("duplicate Kit SKU with a different bill of materials blocks export",()=>{
  const packages=[
    {id:"one",name:"A",platforms:[{platform:"Shopee",packageSku:"DUP"}],components:[{inventorySku:"A",quantity:1}]},
    {id:"two",name:"B",platforms:[{platform:"Lazada",packageSku:"DUP"}],components:[{inventorySku:"B",quantity:1}]},
  ];
  assert.throws(()=>buildKitRows(packages),KitExportError);
});

test("missing SKU and invalid quantity block export",()=>{
  assert.throws(()=>buildKitRows([{id:"one",name:"A",platforms:[{platform:"Shopee",packageSku:""}],components}]),/missing/);
  assert.throws(()=>buildKitRows([{id:"one",name:"A",platforms:[{platform:"Shopee",packageSku:"K"}],components:[{inventorySku:"I",quantity:0}]}]),/invalid quantity/);
});
