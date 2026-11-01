import { saveAccountSetting } from '../../../../account-settings';
export async function PUT(request: Request) { return saveAccountSetting(request, 'company'); }
