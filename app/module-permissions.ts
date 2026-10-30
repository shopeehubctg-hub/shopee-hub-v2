export const PORTAL_MODULES = [
  { id: "overview", label: "Overview", description: "Business pulse, sales and warning summary" },
  { id: "design", label: "Design Checker", description: "Creative compliance review and uploads" },
  { id: "calculator", label: "Price Calculator", description: "Product pricing and commission calculator" },
  { id: "packages", label: "Packages & Pricing", description: "Package setup, schedules and pricing" },
  { id: "advertising", label: "Advertising", description: "Ad balance and campaign performance" },
  { id: "orders", label: "Orders & Inventory", description: "Orders, deadlines and inventory status" },
  { id: "health", label: "Store Health", description: "Ratings, service quality and violations" },
  { id: "protection", label: "Fake Seller Reports", description: "Brand protection cases and outcomes" },
  { id: "live_calendar", label: "Live Calendar", description: "Upcoming livestream sessions for assigned stores" },
  { id: "actions", label: "Client Action Center", description: "Items that require client attention" },
] as const;

export type PortalModuleId = (typeof PORTAL_MODULES)[number]["id"] | "overview_leaderboard" | "overview_leaderboard_all_stores" | "overview_store_sales";

export const ALL_PORTAL_MODULE_IDS:PortalModuleId[] = PORTAL_MODULES.map((module) => module.id);

export function isPortalModuleId(value: unknown): value is PortalModuleId {
  return typeof value === "string" && ALL_PORTAL_MODULE_IDS.includes(value as PortalModuleId);
}

export const OVERVIEW_LEADERBOARD_PERMISSION = {id:"overview_leaderboard",label:"Leaderboard",description:"Overview leaderboard section"} as const;
export const OVERVIEW_STORE_SALES_PERMISSION = {id:"overview_store_sales",label:"Store Daily Sales",description:"Selected-store daily and monthly sales"} as const;
export const ALL_PERMISSION_IDS:PortalModuleId[] = [...ALL_PORTAL_MODULE_IDS,"overview_leaderboard","overview_leaderboard_all_stores","overview_store_sales"];
// Store Health remains Super Admin-only until its ordinary-user store scope is reviewed.
// The all-store leaderboard scope is also intentionally never a tenant-wide release.
export const RELEASABLE_PERMISSION_IDS:PortalModuleId[] = ALL_PERMISSION_IDS.filter(id=>id!=="overview_leaderboard_all_stores"&&id!=="health");
export function isReleasablePermissionId(value:unknown):value is PortalModuleId{return typeof value==="string"&&RELEASABLE_PERMISSION_IDS.includes(value as PortalModuleId);}
export function effectiveAccessIds(role:string,mode:string,tenant:Map<string,boolean>,custom:Set<string>,additive:Set<string>=new Set()):PortalModuleId[]{
 if(role==="superadmin")return [...ALL_PERMISSION_IDS];
 const granted=(id:string)=>additive.has(id)||(mode==="custom"&&custom.has(id));
 const modules:PortalModuleId[]=ALL_PORTAL_MODULE_IDS.filter(id=>additive.has(id)||(mode==="custom"?custom.has(id):id==="live_calendar"?tenant.get(id)===true:tenant.get(id)!==false));
 if(tenant.get("overview")!==false&&modules.includes("overview")&&granted("overview_leaderboard"))modules.push("overview_leaderboard");
 if(modules.includes("overview_leaderboard")&&granted("overview_leaderboard_all_stores"))modules.push("overview_leaderboard_all_stores");
 if(tenant.get("overview")!==false&&modules.includes("overview")&&granted("overview_store_sales"))modules.push("overview_store_sales");
 return modules;
}
