import { ALL_PORTAL_MODULE_IDS, type PortalModuleId } from "./module-permissions";

export function dashboardQueryPlan(request: Request) {
  const params = new URL(request.url).searchParams;
  const section = params.get("section");
  const legacy = section === null;
  const valid = legacy || section === "bootstrap" || section === "account" || section === "permissions"
    || ALL_PORTAL_MODULE_IDS.includes(section as PortalModuleId);
  return {
    section, valid, refresh: params.get("refresh") === "1",
    snapshot: legacy || ["overview", "orders", "health", "protection", "calculator"].includes(section ?? ""),
    advertising: legacy || ["advertising", "overview", "actions"].includes(section ?? ""),
    catalog: legacy || section === "calculator",
    actions: legacy || section === "actions",
    vouchers: legacy || section === "calculator",
  };
}

export function dashboardSectionAllowed(section: string | null, modules: readonly string[], role: string, canManagePermissions: boolean) {
  if (section === null || section === "bootstrap") return true;
  if (section === "account") return role === "superadmin";
  if (section === "permissions") return canManagePermissions;
  return modules.includes(section);
}
