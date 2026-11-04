import {getProjectSelector} from '../../store-project-selector-server';
export const dynamic='force-dynamic';
export async function GET(){return getProjectSelector();}
