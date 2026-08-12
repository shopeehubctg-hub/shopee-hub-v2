export const PORTAL_MODULES = [
  { id: "overview", label: "Overview", description: "Business pulse, sales and warning summary" },
  { id: "design", label: "Design Checker", description: "Creative compliance review and uploads" },
  { id: "calculator", label: "Price Calculator", description: "Product pricing and commission calculator" },
  { id: "packages", label: "Packages & Pricing", description: "Package setup, schedules and pricing" },
  { id: "advertising", label: "Advertising", description: "Ad balance and campaign performance" },
  { id: "orders", label: "Orders & Inventory", description: "Orders, deadlines and inventory status" },
  { id: "health", label: "Store Health", description: "Ratings, service quality and violations" },
  { id: "protection", label: "Fake Seller Reports", description: "Brand protection cases and outcomes" },
  { id: "actions", label: "Client Action Center", description: "Items that require client attention" },
] as const;

export type PortalModuleId = (typeof PORTAL_MODULES)[number]["id"];

export const ALL_PORTAL_MODULE_IDS = PORTAL_MODULES.map((module) => module.id);

export function isPortalModuleId(value: unknown): value is PortalModuleId {
  return typeof value === "string" && ALL_PORTAL_MODULE_IDS.includes(value as PortalModuleId);
}
