import {permissionManagement} from '../../../permission-management';
import {isMarket} from '../../../markets';
import {storeExchangeRatePolicy} from '../../../store-exchange-rate-policy';
import {previousMonth} from '../../../account-ledger';
import {bnmMarketServiceRate,BNM_MONTHLY_URL} from '../../../account-fx-source';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request) {
  try {
    const auth=await permissionManagement();
    if('error' in auth)return auth.error;
    const params=new URL(request.url).searchParams;
    const market=params.get('market');
    const invoiceMonth=params.get('invoiceMonth')??'';
    const policy=isMarket(market)?storeExchangeRatePolicy(market):null;
    if(!policy||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(invoiceMonth))return Response.json({error:'Choose TH or PH and a valid Invoice Month'},{status:400,headers});
    const rate=await bnmMarketServiceRate(invoiceMonth,policy.currency);
    return Response.json({status:rate?'available':'pending',market,invoiceMonth,serviceMonth:previousMonth(invoiceMonth),...policy,rate:rate?.rate??null,reference:BNM_MONTHLY_URL},{headers});
  } catch {
    return Response.json({error:'Unable to load the exchange rate. Please try again.'},{status:503,headers});
  }
}
