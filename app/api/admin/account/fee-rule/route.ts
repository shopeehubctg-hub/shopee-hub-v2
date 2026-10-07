import { saveAccountSetting } from '../../../../account-settings';
export const dynamic='force-dynamic';
export async function PUT(request:Request){return saveAccountSetting(request,'fee_rule');}
