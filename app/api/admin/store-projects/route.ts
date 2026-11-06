import {getStoreProjects,saveStoreProject} from '../../../store-projects-server';
export const dynamic='force-dynamic';
export async function GET(){return getStoreProjects(true);}
export async function POST(request:Request){return saveStoreProject(request);}
