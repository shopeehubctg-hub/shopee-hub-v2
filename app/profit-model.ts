type StoreFact={
  netSales:string|null;platformFees:string|null;adSpend:string|null;
  sellerDiscounts:string|null;goodsCost:string|null;fulfilmentCost:string|null;
  verifiedAt:string|null;sourceRefs:Record<string,string>;
};
type DepartmentFact={
  projectKind:"external"|"internal";cashRevenue:string|null;laborCost:string|null;
  toolCost:string|null;outsourcedCost:string|null;otherCost:string|null;
  internalValue:string|null;hours:string|null;verifiedAt:string|null;sourceRefs:Record<string,string>;
};
function cents(value:string){
  if(!/^-?\d+(\.\d{1,2})?$/.test(value))throw new Error("Invalid exact amount");
  const negative=value.startsWith("-");
  const [whole,fraction=""]=value.replace("-","").split(".");
  const number=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,"0"));
  return negative?-number:number;
}
function amount(value:bigint){
  const negative=value<BigInt(0)?"-":"";
  const absolute=value<BigInt(0)?-value:value;
  return negative+(absolute/BigInt(100)).toString()+"."+(absolute%BigInt(100)).toString().padStart(2,"0");
}
function complete<T extends {verifiedAt:string|null;sourceRefs:Record<string,string>}>(row:T|null,keys:(keyof T)[]){
  return Boolean(row?.verifiedAt&&keys.every(key=>row[key]!==null&&row[key]!==undefined&&Boolean(row.sourceRefs[String(key)])));
}
const storeKeys=["netSales","platformFees","adSpend","sellerDiscounts","goodsCost","fulfilmentCost"] as const;
const departmentKeys=["cashRevenue","laborCost","toolCost","outsourcedCost","otherCost"] as const;
export function storeContribution(row:StoreFact|null){
  if(!complete(row,storeKeys as unknown as (keyof StoreFact)[]))return null;
  // netSales is after seller-funded discounts and refunds; sellerDiscounts remains reconciliation evidence.
  return amount(cents(row!.netSales!)-cents(row!.platformFees!)-cents(row!.adSpend!)-cents(row!.goodsCost!)-cents(row!.fulfilmentCost!));
}
export function departmentContribution(row:DepartmentFact|null){
  if(!complete(row,departmentKeys as unknown as (keyof DepartmentFact)[]))return null;
  if(row!.projectKind==="internal"&&row!.cashRevenue!=="0.00")return null;
  return amount(cents(row!.cashRevenue!)-cents(row!.laborCost!)-cents(row!.toolCost!)-cents(row!.outsourcedCost!)-cents(row!.otherCost!));
}
