import {getStoreProjects} from '../../store-projects-server';
export const dynamic='force-dynamic';
export async function GET(){return getStoreProjects(false);}
