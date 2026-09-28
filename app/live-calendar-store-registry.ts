import "server-only";

const DIRECTORY_CSV = "https://docs.google.com/spreadsheets/d/1iMNKdNs5tqgXgWUQhtg-UhWcb0mP3SlGYbTOyx4avkc/gviz/tq?tqx=out:csv&sheet=WhatsApp%20Group";

function csvRow(line:string) {
  const cells:string[]=[];let cell="";let quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==='"'&&quoted&&line[i+1]==='"'){cell+='"';i++;}
    else if(char==='"')quoted=!quoted;
    else if(char===','&&!quoted){cells.push(cell);cell="";}
    else cell+=char;
  }
  cells.push(cell);return cells;
}

export async function directoryStoreNames() {
  const response=await fetch(DIRECTORY_CSV,{cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error("Link Directory unavailable");
  const rows=(await response.text()).trim().split(/\r?\n/).map(csvRow);
  const nameIndex=rows[0]?.indexOf("Store Name")??-1;
  if(nameIndex<0)throw new Error("Link Directory has no Store Name column");
  return [...new Set(rows.slice(1).map(row=>row[nameIndex]?.trim()).filter((name):name is string=>Boolean(name)))];
}
