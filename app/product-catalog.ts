export const PRODUCT_CATALOG_SOURCE = {
  sheetId:"1b3Z4dLfJRaZkdKDeJ1TLeYFdWApZfX_rmarAPFOldtk",
  tab:"Commission Comparison",
};

export type ProjectProduct = {
  shopName?:string;
  itemId:string;
  productName:string;
  productCategory:string;
  commissionFeeRate:number;
  mainProduct:boolean;
};

export type ProjectProductProfile = {
  shopName:string;
  products:ProjectProduct[];
  mainProducts:ProjectProduct[];
  syncedAt?:string;
};

const sourceAliases:Record<string,string> = {
  "CTG4U Malaysia":"CTG4u Malaysia",
  "KATA Marine Malaysia":"Kata Skincare Malaysia",
  "KATA Care Malaysia":"KATA Care Malaysia",
  "SkinDae Official Store":"SkinDae MY by CTG4u",
  "Zeero MY":"Zeero Skincare Official",
};

export function sourceShopNameFor(storeName:string) {
  return sourceAliases[storeName] ?? storeName;
}

export function parseCsv(text:string) {
  const rows:string[][]=[];
  let row:string[]=[];
  let cell="";
  let quoted=false;
  for(let index=0;index<text.length;index+=1){
    const char=text[index];
    if(char==='"'&&quoted&&text[index+1]==='"'){cell+='"';index+=1;}
    else if(char==='"')quoted=!quoted;
    else if(char===","&&!quoted){row.push(cell);cell="";}
    else if((char==="\n"||char==="\r")&&!quoted){
      if(char==="\r"&&text[index+1]==="\n")index+=1;
      row.push(cell);cell="";
      if(row.some(value=>value!==""))rows.push(row);
      row=[];
    }else cell+=char;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}

function ratePercent(value:string) {
  const numeric=Number(value.replace(/[^0-9.-]/g,""));
  if(!Number.isFinite(numeric))return 0;
  if(value.includes("%"))return numeric;
  return numeric<=1?numeric*100:numeric;
}

export function productRowsFromCsv(text:string):Array<ProjectProduct&{shopName:string}> {
  const rows=parseCsv(text);
  const header=rows[0]??[];
  const column=(...names:string[])=>names.map(name=>header.indexOf(name)).find(index=>index>=0)??-1;
  const shopIndex=column("Shop Name");
  const productIndex=column("Product Name");
  const itemIndex=column("Item ID");
  const categoryIndex=column("最latest的 Category","Product Category");
  const rateIndex=column("8 月的 commission fee","Commission Fee Rate");
  const mainIndex=column("Main Product");
  if([shopIndex,productIndex,itemIndex,categoryIndex,rateIndex,mainIndex].some(index=>index<0))return [];
  return rows.slice(1).flatMap(row=>{
    const shopName=row[shopIndex]?.trim();
    const itemId=row[itemIndex]?.trim();
    const productName=row[productIndex]?.trim();
    const productCategory=row[categoryIndex]?.trim();
    if(!shopName||!itemId||!productName||!productCategory)return [];
    return [{shopName,itemId,productName,productCategory,commissionFeeRate:ratePercent(row[rateIndex]??""),mainProduct:/^(true|yes|1)$/i.test(row[mainIndex]?.trim()??"")}];
  });
}

export async function readProductCatalogSheet(storeName?:string):Promise<ProjectProductProfile|null> {
  try{
    const url=`https://docs.google.com/spreadsheets/d/${PRODUCT_CATALOG_SOURCE.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(PRODUCT_CATALOG_SOURCE.tab)}`;
    const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(5_000)});
    if(!response.ok)return null;
    const rows=productRowsFromCsv(await response.text());
    if(!storeName)return {shopName:"All Stores",products:rows,mainProducts:rows.filter(row=>row.mainProduct)};
    const sourceName=sourceShopNameFor(storeName);
    const products=rows.filter(row=>row.shopName===sourceName).map(({shopName:_,...product})=>product);
    return products.length?{shopName:sourceName,products,mainProducts:products.filter(product=>product.mainProduct)}:null;
  }catch{return null;}
}
