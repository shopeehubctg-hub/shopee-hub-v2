export function canReadShopeeAds({ membership, tenantActive, storeExists, tenantAdvertisingEnabled, userAdvertisingEnabled, assignedStore }) {
  if (!membership?.active || !tenantActive || !storeExists) return false;
  if (!["role_default", "custom"].includes(membership.module_access_mode)) return false;
  if (!["all", "selected"].includes(membership.store_access_mode)) return false;
  if (membership.role === "superadmin") return true;
  if (membership.role !== "customer" && membership.role !== "manager") return false;
  if (tenantAdvertisingEnabled === false) return false;
  if (membership.module_access_mode === "custom" && userAdvertisingEnabled !== true) return false;
  if (membership.store_access_mode === "selected" && !assignedStore) return false;
  return true;
}
