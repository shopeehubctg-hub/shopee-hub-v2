/** Missing or null preserves a saved name; empty strings never clear registered identity. */
export function optionalBillingName(value:unknown):string|null{
 if(value===undefined||value===null)return null;
 if(typeof value!=='string')throw Error('Enter Registered Name (Billing), up to 240 characters.');
 const name=value.trim().replace(/\s+/gu,' ');
 if(!name||name.length>240||/[\u0000-\u001f\u007f]/u.test(name))throw Error('Enter Registered Name (Billing), up to 240 characters.');
 return name;
}
