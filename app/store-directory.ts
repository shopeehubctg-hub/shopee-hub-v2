import "server-only";
import { supabaseRest } from "./supabase-rest";

export type ProjectLink = { project: string; href: string; driveLink: string };
export type StoreDirectoryProfile = {
  store_id: string;
  store_name: string;
  ads_top_up_owner: "Client" | "Client Approval" | "Shopee Hub" | null;
  store_group_link: string | null;
  google_drive_link: string | null;
};
type ProjectRow = { id: number; store_id: string; project_name: string; project_group_link: string; google_drive_link: string | null };
export type StoreDetails = {
  projectLinks: ProjectLink[];
  storeGroupLink: string;
  googleDriveLink: string;
  adsTopUpOwner: StoreDirectoryProfile["ads_top_up_owner"];
};

export async function storeDirectory(tenantId: string) {
  const [profiles, projects] = await Promise.all([
    supabaseRest<StoreDirectoryProfile[]>(`link_directory_stores?select=store_id,store_name,ads_top_up_owner,store_group_link,google_drive_link&tenant_id=eq.${encodeURIComponent(tenantId)}`),
    supabaseRest<ProjectRow[]>(`link_directory_projects?select=id,store_id,project_name,project_group_link,google_drive_link&order=id.asc`)
      .catch(async error => {
        if (!(error instanceof Error) || !error.message.includes("google_drive_link")) throw error;
        return supabaseRest<ProjectRow[]>(`link_directory_projects?select=id,store_id,project_name,project_group_link&order=id.asc`);
      }),
  ]);
  const byId = new Map(profiles.map(profile => [profile.store_id, profile]));
  const links = new Map<string, ProjectLink[]>();
  for (const project of projects) {
    if (!byId.has(project.store_id)) continue;
    const current = links.get(project.store_id) ?? [];
    current.push({ project: project.project_name, href: project.project_group_link, driveLink: project.google_drive_link ?? "" });
    links.set(project.store_id, current);
  }
  return { byId, links };
}

export function storeDetails(directory: Awaited<ReturnType<typeof storeDirectory>>, storeId: string): StoreDetails {
  const profile = directory.byId.get(storeId);
  return {
    projectLinks: directory.links.get(storeId) ?? [],
    storeGroupLink: profile?.store_group_link ?? "",
    googleDriveLink: profile?.google_drive_link ?? "",
    adsTopUpOwner: profile?.ads_top_up_owner ?? null,
  };
}

function validWebUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch { return false; }
}

export function parseStoreDetails(body: Record<string, unknown>): { value: StoreDetails } | { error: string } {
  const storeGroupLink = typeof body.storeGroupLink === "string" ? body.storeGroupLink.trim() : "";
  const googleDriveLink = typeof body.googleDriveLink === "string" ? body.googleDriveLink.trim() : "";
  if (storeGroupLink.length > 2000 || googleDriveLink.length > 2000 || !validWebUrl(storeGroupLink) || !validWebUrl(googleDriveLink))
    return { error: "Enter valid Store Group and Google Drive links" };
  const adsTopUpOwner = body.adsTopUpOwner === null || body.adsTopUpOwner === undefined || body.adsTopUpOwner === "" ? null : body.adsTopUpOwner;
  if (adsTopUpOwner !== null && adsTopUpOwner !== "Client" && adsTopUpOwner !== "Client Approval" && adsTopUpOwner !== "Shopee Hub")
    return { error: "Select a valid Ads Top Up List owner" };
  const suppliedLinks = body.projectLinks === undefined ? [] : body.projectLinks;
  if (!Array.isArray(suppliedLinks) || suppliedLinks.length > 20)
    return { error: "Enter up to 20 project group links" };
  const projectLinks: ProjectLink[] = [];
  const names = new Set<string>();
  for (const item of suppliedLinks) {
    if (!item || typeof item !== "object") return { error: "Enter a project name and group link" };
    const project = typeof item.project === "string" ? item.project.trim() : "";
    const href = typeof item.href === "string" ? item.href.trim() : "";
    const driveLink = typeof item.driveLink === "string" ? item.driveLink.trim() : "";
    if (!project && !href) continue;
    if (!project || !href || project.length > 120 || href.length > 2000 || driveLink.length > 2000 || !validWebUrl(href) || !validWebUrl(driveLink))
      return { error: "Enter a valid project name and group link" };
    const key = project.toLowerCase();
    if (names.has(key)) return { error: "Project names must be unique for a store" };
    names.add(key);
    projectLinks.push({ project, href, driveLink });
  }
  return { value: { projectLinks, storeGroupLink, googleDriveLink, adsTopUpOwner } };
}

export async function saveStoreDetails(tenantId: string, storeId: string, storeName: string, details: StoreDetails) {
  const old = await storeDirectory(tenantId);
  const previous = old.byId.get(storeId);
  const oldProjects = old.links.get(storeId) ?? [];
  const profile = {
    store_id: storeId, tenant_id: tenantId, store_name: previous?.store_name ?? storeName,
    ads_top_up_owner: details.adsTopUpOwner,
    store_group_link: details.storeGroupLink || null,
    google_drive_link: details.googleDriveLink || null,
    source_sheet_id: previous ? undefined : null,
  };
  await supabaseRest(`link_directory_stores?on_conflict=store_id`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(profile),
  });
  try {
    await supabaseRest(`link_directory_projects?store_id=eq.${encodeURIComponent(storeId)}`, { method: "DELETE" });
    if (details.projectLinks.length) await supabaseRest("link_directory_projects", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify(details.projectLinks.map(link => ({ store_id: storeId, project_name: link.project, project_group_link: link.href, google_drive_link: link.driveLink || null }))),
    });
  } catch (error) {
    // Restore the previous links if a replacement fails after deletion.
    try {
      await supabaseRest(`link_directory_projects?store_id=eq.${encodeURIComponent(storeId)}`, { method: "DELETE" });
      if (oldProjects.length) await supabaseRest("link_directory_projects", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(oldProjects.map(link => ({ store_id: storeId, project_name: link.project, project_group_link: link.href, google_drive_link: link.driveLink || null }))),
      });
      if (previous) await supabaseRest(`link_directory_stores?store_id=eq.${encodeURIComponent(storeId)}`, {
        method: "PATCH", body: JSON.stringify({ ads_top_up_owner: previous.ads_top_up_owner, store_group_link: previous.store_group_link, google_drive_link: previous.google_drive_link }),
      });
      else await supabaseRest(`link_directory_stores?store_id=eq.${encodeURIComponent(storeId)}`, { method: "DELETE" });
    } catch (restoreError) {
      console.error("Store directory rollback failed", restoreError);
    }
    throw error;
  }
}
