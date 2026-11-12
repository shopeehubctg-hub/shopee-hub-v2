"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {StoreProjectEditor} from "./store-project-editor";
import "./permission-settings-refined.css";
import { StoreStatusControl } from "./store-status-control";
import { StoreExchangeRateField } from "./store-exchange-rate-field";
import { MARKET_CODES, MARKET_CONFIG, marketFromPlatform, type MarketCode } from "./markets";
import { useFeePlans } from "./fee-plan-context";
import { PORTAL_MODULES, OVERVIEW_LEADERBOARD_PERMISSION, OVERVIEW_STORE_SALES_PERMISSION, RELEASABLE_PERMISSION_IDS, type PortalModuleId } from "./module-permissions";
import { AccountSetupFields, accountSetupError, emptyAccountSetup, accountSetupPayload, resetAccountSetupSelection, malaysiaMonth, type AccountSetupDraft } from "./store-account-setup-fields";

type Props = { staging?:boolean; accountSetupPreview?:boolean; initialEnabledModules: PortalModuleId[]; onStoreChanged?: () => void };
type Role = "customer" | "manager" | "superadmin";
type AdsTopUpOwner = "Client" | "Client Approval" | "Shopee Hub";
type ProjectLink = { project: string; href: string; driveLink?: string };
type StoreLinks = {
  projectLinks: ProjectLink[];
  storeGroupLink: string;
  googleDriveLink: string;
  adsTopUpOwner: AdsTopUpOwner | "";
};
type StoreDraft = StoreLinks & { name: string; market: MarketCode };
type Store = { id: string; name: string; serviceStatus?: "active"|"inactive"|"ended"; platform: string; bigseller_name?: string; accountUnit?: { rosterKey: string; legalEntity: string; billingEntity?: string | null; latestVersion: string } | null; accountUnitCount?: number } & Partial<StoreLinks>;
const emptyStoreDraft = (): StoreDraft => ({ name: "", market: "MY", projectLinks: [], storeGroupLink: "", googleDriveLink: "", adsTopUpOwner: "" });

function projectLinkError(link: ProjectLink) {
  if (!link.project.trim() && !link.href.trim() && !link.driveLink?.trim()) return "";
  if (link.driveLink?.trim() && (!link.project.trim() || !link.href.trim())) return "Add a project name and Project Group Link to save this Drive Link.";
  if (!link.project.trim() || !link.href.trim()) return "Enter both a project name and Project Group Link.";
  return "";
}

function StoreLinkFields({ draft, update, idPrefix }: { draft: StoreDraft; update: (patch: Partial<StoreDraft>) => void; idPrefix: string }) {
  const updateProjectLink = (index: number, patch: Partial<ProjectLink>) => update({
    projectLinks: draft.projectLinks.map((link, position) => position === index ? { ...link, ...patch } : link),
  });
  return <>
    <fieldset className="store-link-fields">
      <legend>Project Group Links</legend>
      <p id={`${idPrefix}-project-limit`} className="store-access-note">Add one row per project, up to 20 ({draft.projectLinks.length}/20).</p>
      {draft.projectLinks.map((link, index) => {
        const error = projectLinkError(link);
        const errorId = `${idPrefix}-project-${index}-error`;
        return <div className="store-project-link" key={index}>
        <label>Project name<input maxLength={120} value={link.project} aria-invalid={!!error && !link.project.trim()} aria-describedby={error ? errorId : undefined} onChange={event => updateProjectLink(index, { project: event.target.value })} placeholder="Project name" /></label>
        <label>Project Group Link<input type="url" maxLength={2048} value={link.href} aria-invalid={!!error && !link.href.trim()} aria-describedby={error ? errorId : undefined} onChange={event => updateProjectLink(index, { href: event.target.value })} placeholder="https://…" /></label>
        <label className="store-project-drive">Project Google Drive Link (optional)<input type="url" maxLength={2048} value={link.driveLink ?? ""} onChange={event => updateProjectLink(index, { driveLink: event.target.value })} placeholder="https://…" /></label>
        <button type="button" className="edit-access" aria-label={`Remove project link ${index + 1}`} onClick={() => update({ projectLinks: draft.projectLinks.filter((_, position) => position !== index) })}>Remove</button>
        {error && <p id={errorId} className="store-field-error" role="alert">{error}</p>}
      </div>})}
      <button type="button" className="edit-access" disabled={draft.projectLinks.length >= 20} aria-describedby={`${idPrefix}-project-limit`} onClick={() => update({ projectLinks: [...draft.projectLinks, { project: "", href: "", driveLink: "" }] })}>+ Add project link</button>
    </fieldset>
    <label>Store Group Link<input type="url" maxLength={2048} value={draft.storeGroupLink} onChange={event => update({ storeGroupLink: event.target.value })} placeholder="https://…" /></label>
    <label>Store Google Drive Link (default)<input type="url" maxLength={2048} value={draft.googleDriveLink} onChange={event => update({ googleDriveLink: event.target.value })} placeholder="https://…" /></label>
    <label>Ads Top Up List<select value={draft.adsTopUpOwner} onChange={event => update({ adsTopUpOwner: event.target.value as StoreLinks["adsTopUpOwner"] })}>
      <option value="">Not set</option><option value="Client">Client</option><option value="Client Approval">Client Approval</option><option value="Shopee Hub">Shopee Hub</option>
    </select></label>
  </>;
}
type PortalUser = {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  moduleAccessMode: "role_default" | "custom";
  storeAccessMode: "all" | "selected";
  enabledModules: PortalModuleId[];
  storeIds: string[];
  createdAt: string;
  canManagePermissions: boolean;
  editable: boolean;
  permissionsVersion: number;
};
const STANDARD_CLIENT_MODULES: PortalModuleId[] = ["calculator", "packages", "advertising", "actions"];
const DEFAULT_MODULES = PORTAL_MODULES.filter(module => module.id !== "health");
const SEPARATE_MODULES = [
  { id: "overview_leaderboard_all_stores", label: "Leaderboard · All stores", description: "Grant to selected users with Custom access" },
  { id: "live_sales_monitor", label: "Live Sales Monitor", description: "Manage viewers in the live session" },
] as const;
const ACCESS_MODULES = [...PORTAL_MODULES, OVERVIEW_LEADERBOARD_PERMISSION, OVERVIEW_STORE_SALES_PERMISSION];
const BULK_FEATURES = [...ACCESS_MODULES, ...SEPARATE_MODULES];

type PermissionAccess = { isSuperAdmin: boolean; canManageStores: boolean; canManageDefaults: boolean; grantableModules: PortalModuleId[] };
type UserData = {
  users: PortalUser[];
  stores: Store[];
  clientDefaults: PortalModuleId[];
  accountSettingsAvailable: boolean;
  accountRegisteredNamesAvailable?: boolean;
  access: PermissionAccess;
};

export function PermissionSettings({ staging=false, initialEnabledModules, onStoreChanged, accountSetupPreview=false }: Props) {
  const { plans } = useFeePlans();
  const [tab, setTab] = useState<"users" | "stores" | "modules">("users");
  const [enabled, setEnabled] = useState(new Set(initialEnabledModules));
  const [saved, setSaved] = useState(new Set(initialEnabledModules));
  const [data, setData] = useState<UserData | null>(null);
  const [editing, setEditing] = useState<PortalUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [releaseModule,setReleaseModule]=useState<PortalModuleId>("overview");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [bulkModule, setBulkModule] = useState("");
  const [bulkAction, setBulkAction] = useState<"grant" | "revoke" | null>(null);
  const [bulkError, setBulkError] = useState("");
  const bulkRequest = useRef<string | null>(null);
  const [releaseOpen,setReleaseOpen]=useState(false);
  const [releaseResult,setReleaseResult]=useState("");
  const releaseRequest=useRef<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [userError, setUserError] = useState("");
  const [storeError, setStoreError] = useState("");
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<PortalModuleId | "all" | "outside_standard" | "missing_standard">("all");
  const [storeSearch,setStoreSearch]=useState("");
  const [storeCountry,setStoreCountry]=useState<"all"|MarketCode>("all");
  const [storeService,setStoreService]=useState("all");
  const [adding, setAdding] = useState(false);
  const [addingStore, setAddingStore] = useState(false);
  const [projectEditor,setProjectEditor]=useState<{storeId?:string}|null>(null);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeDraft, setStoreDraft] = useState<StoreDraft>(emptyStoreDraft);
  const [newStore, setNewStore] = useState<StoreDraft>(emptyStoreDraft);
  const [newAccount, setNewAccount] = useState<AccountSetupDraft>(emptyAccountSetup);
  const [editLegalEntity, setEditLegalEntity] = useState("");
  const [editBillingEntity, setEditBillingEntity] = useState("");
  const [editEntityMonth, setEditEntityMonth] = useState(malaysiaMonth);
  const storeRequest = useRef<{ payload: string; id: string } | null>(null);
  const userRequest = useRef<{ payload: string; id: string } | null>(null);
  const storeModalRef = useRef<HTMLDivElement>(null);
  const storeNameInputRef = useRef<HTMLInputElement>(null);
  const storeReturnFocusRef = useRef<HTMLElement | null>(null);
  const updateNewStore = (patch: Partial<StoreDraft>) => { setStoreError(""); setNewStore(current => ({ ...current, ...patch })); };
  const updateStoreDraft = (patch: Partial<StoreDraft>) => { setStoreError(""); setStoreDraft(current => ({ ...current, ...patch })); };
  const updateNewAccount = (patch: Partial<AccountSetupDraft>) => { setStoreError(""); setNewAccount(current => ({ ...current, ...patch })); };
  function closeStoreModal() {
    setAddingStore(false);
    setEditingStore(null);
    setStoreError("");
    requestAnimationFrame(() => {
      if (storeReturnFocusRef.current?.isConnected) storeReturnFocusRef.current.focus();
    });
  }
  function handleStoreModalKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !saving) {
      event.preventDefault();
      closeStoreModal();
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(storeModalRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'
    ) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !storeModalRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !storeModalRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }
  const [newUser, setNewUser] = useState({
    displayName: "",
    email: "",
    role: "customer" as Role,
  });
  const access = data?.access;
  const isSuperAdmin = access?.isSuperAdmin === true;
  const grantableModules = [PORTAL_MODULES[0],OVERVIEW_LEADERBOARD_PERMISSION,OVERVIEW_STORE_SALES_PERMISSION,...PORTAL_MODULES.slice(1)].filter(module=>isSuperAdmin||access?.grantableModules.includes(module.id));
  const dirty = useMemo(
    () => PORTAL_MODULES.some(({ id }) => enabled.has(id) !== saved.has(id)),
    [enabled, saved],
  );
  async function loadUsers() {
    setLoadError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.access) throw Error(result?.error ?? "Unable to load Permission Settings.");
      setData(result);
      setTab(current => current === "stores" && !result.access.canManageStores || current === "modules" && !result.access.canManageDefaults ? "users" : current);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load Permission Settings.");
    }
  }
  useEffect(() => {
    loadUsers();
  }, []);
  useEffect(() => {
    const next = new Set(initialEnabledModules);
    setEnabled(next);
    setSaved(next);
  }, [initialEnabledModules]);
  useEffect(() => {
    if (addingStore || editingStore) storeNameInputRef.current?.focus();
  }, [addingStore, editingStore]);
  async function saveDefaults() {
    setSaving(true);
    const enabledModules = PORTAL_MODULES.filter(({ id }) =>
      enabled.has(id),
    ).map(({ id }) => id);
    const response = await fetch("/api/admin/permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledModules }),
    });
    setSaving(false);
    if (response.ok) {
      setSaved(new Set(enabledModules));
      setMessage("Default client access updated.");
      await loadUsers();
    } else setMessage("Unable to save module visibility.");
  }
  async function saveBulkAccess() {
    if (!bulkAction || !bulkModule || !selectedUsers.length) return;
    setSaving(true);
    setBulkError("");
    bulkRequest.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/feature-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: bulkModule, action: bulkAction, users: selectedUsers.map(id => ({ id, version: data?.users.find(user => user.id === id)?.permissionsVersion })), requestId: bulkRequest.current }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw Error(result?.error ?? "Unable to update feature access.");
      setMessage(`${result.changed} updated · ${result.unchanged} already set${result.skipped ? ` · ${result.skipped} ineligible` : ""}.`);
      setBulkAction(null);
      setSelectedUsers([]);
      await loadUsers();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Unable to update feature access.");
    } finally {
      setSaving(false);
    }
  }
  async function releaseFeature(){
    setSaving(true);setReleaseResult("");
    if(!releaseRequest.current)releaseRequest.current=crypto.randomUUID();
    try{
      const response=await fetch("/api/admin/feature-release",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({moduleId:releaseModule,requestId:releaseRequest.current})});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw Error(result?.error??"Unable to release feature");
      setReleaseOpen(false);
      setReleaseResult(`Released to ${result.granted ?? 0} users · ${result.alreadyEnabled ?? 0} already had access${result.skipped?` · ${result.skipped} skipped`:""}.`);
      releaseRequest.current=null;
      await loadUsers();
    }catch(error){setReleaseResult(error instanceof Error?error.message:"Unable to release feature");}
    finally{setSaving(false);}
  }
  async function addUser() {
    setUserError("");
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSuperAdmin ? newUser : { displayName: newUser.displayName, email: newUser.email, role: "customer", canManagePermissions: false, moduleAccessMode: "custom", enabledModules: [], storeAccessMode: "selected", storeIds: [] }),
      });
      const result = await response
        .json()
        .catch(() => ({ error: "The server returned an invalid response" }));
      if (!response.ok) {
        setUserError(result.error ?? "Unable to add user");
        return;
      }
      setData(result);
      setAdding(false);
      setNewUser({ displayName: "", email: "", role: "customer" });
      setMessage("User access created.");
    } catch {
      setUserError("Unable to add user. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  const accountMarket = newStore.market;
  const accountSetupAvailable = accountSetupPreview && data?.accountSettingsAvailable === true;
  const newAccountPreview = accountSetupAvailable;
  const editAccountPreview = accountSetupAvailable && !!editingStore;
  async function addStore() {
    if (accountSetupPreview && !accountSetupAvailable) { setStoreError("Unlock Account to add a Store with its billing setup."); return; }
    if (newStore.projectLinks.some(projectLinkError)) return;
    const visibleMonth = storeModalRef.current?.querySelector<HTMLInputElement>('[name="accountEffectiveInvoiceMonth"]')?.value;
    if (visibleMonth !== undefined && visibleMonth !== newAccount.effectiveMonth) {
      setNewAccount(current => ({ ...current, effectiveMonth: visibleMonth }));
      setStoreError("Invoice month changed. Review the Rate Card before adding this store.");
      return;
    }
    const setupError = newAccountPreview ? accountSetupError(newAccount, accountMarket, plans) : null;
    if (setupError) { setStoreError(setupError); return; }
    setStoreError("");
    setSaving(true);
    try {
      const accountSetup = newAccountPreview ? accountSetupPayload(newAccount, accountMarket, plans) : undefined;
      const payload = { ...newStore, adsTopUpOwner: newStore.adsTopUpOwner || null, accountSetup };
      const payloadText = JSON.stringify(payload);
      if (storeRequest.current?.payload !== payloadText) storeRequest.current = { payload: payloadText, id: crypto.randomUUID() };
      const response = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: storeRequest.current.id }),
      });
      const result = await response.json().catch(() => ({ error: "The server returned an invalid response" }));
      if (!response.ok) {
        setStoreError(result.error ?? "Unable to add store");
        return;
      }
      setData(current => current ? {
        ...current,
        stores: [...current.stores, result.store].sort((a, b) => a.name.localeCompare(b.name)),
      } : current);
      await loadUsers();
      onStoreChanged?.();
      closeStoreModal();
      setNewStore(emptyStoreDraft());
      setNewAccount(emptyAccountSetup());
      storeRequest.current = null;
      setMessage("Store added. Customer access can be assigned under Users & roles.");
    } catch {
      setStoreError("Unable to add store. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  async function saveStore() {
    if (!editingStore) return;
    if (storeDraft.projectLinks.some(projectLinkError)) return;
    const companyChanged = editAccountPreview && !!editingStore.accountUnit && (editLegalEntity.trim() !== editingStore.accountUnit.legalEntity || (!!editBillingEntity.trim() && editBillingEntity.trim() !== (editingStore.accountUnit.billingEntity ?? "")));
    if (companyChanged && (!editLegalEntity.trim() || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(editEntityMonth) || editEntityMonth < malaysiaMonth())) {
      setStoreError("Enter a legal company name and current or future effective month.");
      return;
    }
    setStoreError("");
    setSaving(true);
    try {
      const payload = { id: editingStore.id, ...storeDraft, adsTopUpOwner: storeDraft.adsTopUpOwner || null,
        ...(companyChanged && editingStore.accountUnit ? { legalEntity: editLegalEntity.trim(), ...(data?.accountRegisteredNamesAvailable && editBillingEntity.trim() ? { billingEntity: editBillingEntity.trim() } : {}), effectiveMonth: editEntityMonth, accountRosterKey: editingStore.accountUnit.rosterKey, expectedAccountVersion: editingStore.accountUnit.latestVersion } : {}) };
      const payloadText = JSON.stringify(payload);
      if (storeRequest.current?.payload !== payloadText) storeRequest.current = { payload: payloadText, id: crypto.randomUUID() };
      const response = await fetch("/api/admin/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: storeRequest.current.id }),
      });
      const result = await response.json().catch(() => ({ error: "The server returned an invalid response" }));
      if (!response.ok) {
        setStoreError(result.error ?? "Unable to update store");
        return;
      }
      setData(current => current ? {
        ...current,
        stores: current.stores.map(store => store.id === editingStore.id ? result.store : store).sort((a, b) => a.name.localeCompare(b.name)),
      } : current);
      await loadUsers();
      onStoreChanged?.();
      closeStoreModal();
      storeRequest.current = null;
      setMessage("Store updated.");
    } catch {
      setStoreError("Unable to update store. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  async function saveUser() {
    if (!editing || !editing.editable) return;
    setUserError("");
    setSaving(true);
    try {
      const payload = {
        id: editing.id, displayName: editing.displayName, active: editing.active,
        moduleAccessMode: isSuperAdmin ? editing.moduleAccessMode : "custom",
        enabledModules: (isSuperAdmin ? editing.enabledModules : editing.enabledModules.filter(id => access?.grantableModules.includes(id))).filter(id=>editing.moduleAccessMode==="custom"||!id.startsWith("overview_")),
        storeAccessMode: isSuperAdmin ? editing.storeAccessMode : "selected", storeIds: editing.storeIds,
        ...(isSuperAdmin ? { role: editing.role, canManagePermissions: editing.canManagePermissions } : {}),
        expectedVersion: editing.permissionsVersion,
      };
      const payloadText = JSON.stringify(payload);
      if (userRequest.current?.payload !== payloadText) userRequest.current = { payload: payloadText, id: crypto.randomUUID() };
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: userRequest.current.id }),
      });
      const result = await response.json().catch(() => ({ error: "The server returned an invalid response" }));
      if (!response.ok) { setUserError(result.error ?? "Unable to update user"); return; }
      setData(result);
      setEditing(null);
      userRequest.current = null;
      setMessage("User access updated.");
    } catch {
      setUserError("Unable to update user. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  function beginStoreEdit(store:Store,trigger:HTMLElement){
                  storeReturnFocusRef.current = trigger.closest('details')?.querySelector('summary') as HTMLElement ?? trigger;
                  const menu=trigger.closest('details');if(menu)menu.open=false;
                  setMessage("");
                  setStoreError("");
                  setEditingStore(store);
                  setStoreDraft({
                    name: store.name,
                    market: marketFromPlatform(store.platform),
                    projectLinks: store.projectLinks?.map(link => ({ ...link })) ?? [],
                    storeGroupLink: store.storeGroupLink ?? "",
                    googleDriveLink: store.googleDriveLink ?? "",
                    adsTopUpOwner: store.adsTopUpOwner ?? "",
                  });
                  setEditLegalEntity(store.accountUnit?.legalEntity ?? "");
                  setEditBillingEntity(store.accountUnit?.billingEntity ?? "");
                  setEditEntityMonth(malaysiaMonth());
                  }
  const visibleStores=(data?.stores??[]).filter(store=>(!storeSearch.trim()||store.name.toLowerCase().includes(storeSearch.trim().toLowerCase()))&&(storeCountry==="all"||marketFromPlatform(store.platform)===storeCountry)&&(storeService==="all"||(store.serviceStatus??"active")===storeService));
  const users =
    data?.users.filter((user) =>
      `${user.displayName} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()) && (moduleFilter === "all" || (moduleFilter === "outside_standard"
        ? user.active && user.role !== "superadmin" && user.enabledModules.some(id => !STANDARD_CLIENT_MODULES.includes(id))
        : moduleFilter === "missing_standard"
          ? user.active && user.role !== "superadmin" && STANDARD_CLIENT_MODULES.some(id => !user.enabledModules.includes(id))
          : user.active && user.enabledModules.includes(moduleFilter))),
    ) ?? [];
  function updateEditing(patch: Partial<PortalUser>) {
    setEditing((current) => {
      if (!current) return current;
      const next={...current,...patch,...(!isSuperAdmin ? { role: current.role, canManagePermissions: current.canManagePermissions, moduleAccessMode: "custom" as const, storeAccessMode: "selected" as const } : {})};
      if(!next.enabledModules.includes("overview"))next.enabledModules=next.enabledModules.filter(id=>id!=="overview_leaderboard"&&id!=="overview_leaderboard_all_stores"&&id!=="overview_store_sales");
      if(!next.enabledModules.includes("overview_leaderboard"))next.enabledModules=next.enabledModules.filter(id=>id!=="overview_leaderboard_all_stores");
      if (next.role === "superadmin") next.canManagePermissions = false;
      if(next.role==="customer"&&patch.enabledModules?.includes("live_calendar")&&next.storeAccessMode==="all")
        return {...next,storeAccessMode:"selected",storeIds:[]};
      return next;
    });
  }
  if (!data) return <div className="permission-page"><section className="permission-hero permission-heading"><div><h2>Permission settings</h2></div></section>{loadError?<div className="access-error" role="alert">{loadError} <button type="button" onClick={loadUsers}>Retry</button></div>:<div className="access-toolbar card" role="status" aria-busy="true">Loading permissions…</div>}</div>;
  return (
    <div className="permission-page" onClick={event=>{if(!(event.target as HTMLElement).closest('.directory-menu'))document.querySelectorAll<HTMLDetailsElement>('.directory-menu[open]').forEach(menu=>{menu.open=false;});}}>
      <section className="permission-hero permission-heading">
        <div className="permission-heading-title"><h2>Permission settings</h2>{staging&&<span className="permission-stage" data-environment="staging">Staging</span>}</div>
        {isSuperAdmin && <span className="superadmin-badge">Super Admin</span>}
      </section>
      <div className="access-tabs">
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          Users & roles
        </button>
        {access?.canManageStores && <button
          className={tab === "stores" ? "active" : ""}
          onClick={() => setTab("stores")}
        >
          Stores
        </button>}
        {access?.canManageDefaults && <button
          className={tab === "modules" ? "active" : ""}
          onClick={() => setTab("modules")}
        >
          Client module defaults
        </button>}
      </div>
      {message && <div className="access-message">{message}</div>}
      {loadError && <div className="access-error" role="alert">{loadError} <button type="button" onClick={loadUsers}>Retry</button></div>}

      {tab === "users" && (
        <>
          <section className="access-toolbar card">
            <div>
              <strong>{data?.users.length ?? 0} portal users</strong>
              <span>
                {data?.users.filter((user) => user.active).length ?? 0} active
              </span>
            </div>
            <input
              aria-label="Search users"
              placeholder="Search name, email or role"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setSelectedUsers([]); }}
            />
            <button disabled={!data} onClick={() => { setUserError(""); setAdding(true); }}>+ Add user</button>
          </section>
          <label className="access-module-filter">
            Filter by access
            <select value={moduleFilter} onChange={event => { setModuleFilter(event.target.value as typeof moduleFilter); setSelectedUsers([]); }}>
              <option value="all">All users</option>
              <option value="outside_standard">Users with extra access</option>
              <option value="missing_standard">Users missing standard access</option>
              {ACCESS_MODULES.map(module => <option key={module.id} value={module.id}>{module.label}</option>)}
            </select>
          </label>
          {isSuperAdmin && selectedUsers.length > 0 && <section className="feature-release-bar card" aria-label="Selected users">
            <strong>{selectedUsers.length} selected</strong>
            <div className="feature-release-actions">
              <select aria-label="Feature to update" value={bulkModule} onChange={event => setBulkModule(event.target.value)}>
                <option value="">Choose a feature</option>
                {BULK_FEATURES.map(module => (
                  <option key={module.id} value={module.id} disabled={module.id === "live_sales_monitor"}>
                    {module.label}{module.id === "live_sales_monitor" ? " — manage in the live session" : ""}
                  </option>
                ))}
              </select>
              <button className="edit-access" onClick={() => setSelectedUsers([])}>Clear</button>
              {(["grant", "revoke"] as const).map(action =>
                <button key={action} className={action === "grant" ? "primary" : "edit-access"} disabled={!bulkModule || saving || (action === "grant" && bulkModule.startsWith("overview_") && !saved.has("overview"))}
                  onClick={() => { bulkRequest.current = null; setBulkError(""); setBulkAction(action); }}>
                  {action === "grant" ? "Grant access" : "Revoke access"}
                </button>
              )}
            </div>
            {bulkModule.startsWith("overview_") && !saved.has("overview") &&
              <p role="status">Turn on Overview in Client module defaults before granting this feature.</p>}
          </section>}
          <section className="user-access-list" aria-label="User permissions">
            {data && !users.length && <p>No users match these filters.</p>}
            {users.map((user) => (
              <article
                className={`card user-access-row${user.active ? "" : " inactive"}`}
                key={user.id}
              >
                {isSuperAdmin && user.editable && user.active && user.role !== "superadmin" ?
                  <input type="checkbox" aria-label={`Select ${user.email}`} checked={selectedUsers.includes(user.id)}
                    onChange={event => setSelectedUsers(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} /> :
                  <div className="user-avatar">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</div>}

                <div className="user-identity">
                  <h3>{user.displayName || "Unnamed user"}</h3>
                  <p>{user.email}</p>
                </div>
                <span className={`role-badge ${user.role}`}>
                  {user.role === "superadmin"
                    ? "Super Admin"
                    : user.role === "manager"
                      ? "Manager"
                      : "Customer"}
                </span>
                <div className="access-scope">
                  <b>
                    {user.storeAccessMode === "all"
                      ? "All stores"
                      : `${user.storeIds.length} stores`}
                  </b>
                  <span>
                    {user.moduleAccessMode === "custom"
                      ? `${user.enabledModules.length} custom modules`
                      : "Role defaults"}
                  </span>
                  {user.active && <div className="access-module-labels" aria-label="Enabled modules">
                    {user.enabledModules.length === 0 ? <span>No modules</span> :
                      ACCESS_MODULES.filter(module => user.enabledModules.includes(module.id)).map(module =>
                        <span key={module.id}>{module.label}{module.id === "overview_leaderboard" &&
                          user.enabledModules.includes("overview_leaderboard_all_stores") ? " · All stores" : ""}</span>)}
                  </div>}
                </div>
                <span
                  className={
                    user.active ? "account-status active" : "account-status"
                  }
                >
                  {user.active ? "Active" : "Disabled"}
                </span>
                <button
                  className="edit-access"
                  disabled={!user.editable}
                  onClick={() => {
                    setUserError("");
                    userRequest.current = null;
                    setEditing(isSuperAdmin ? { ...user } : { ...user, moduleAccessMode: "custom", storeAccessMode: "selected", enabledModules: user.enabledModules.filter(id => access?.grantableModules.includes(id)) });
                  }}
                >
                  Manage
                </button>
              </article>
            ))}
          </section>
        </>
      )}

      {tab === "modules" && access?.canManageDefaults && (
        <>
          {isSuperAdmin&&<section className="feature-release card" aria-label="Release a feature">
            <strong>Release a feature</strong>
            <label><select aria-label="Feature to release" value={releaseModule} onChange={event=>{setReleaseModule(event.target.value as PortalModuleId);releaseRequest.current=null;}}>{[...PORTAL_MODULES,OVERVIEW_LEADERBOARD_PERMISSION,OVERVIEW_STORE_SALES_PERMISSION].filter(item=>RELEASABLE_PERMISSION_IDS.includes(item.id)).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <button type="button" onClick={()=>{setReleaseResult("");setReleaseOpen(true);}}>Release to everyone</button>
            {releaseResult&&<p className="feature-release-result" role="status">{releaseResult}</p>}
          </section>}
          <section className="permission-summary card">
            <div>
              <span>Default customer access</span>
              <strong>
                {DEFAULT_MODULES.filter(module => enabled.has(module.id)).length} of {DEFAULT_MODULES.length} modules
              </strong>
            </div>
            <div className="permission-quick-actions">
              <button
                onClick={() =>
                  setEnabled(new Set([...DEFAULT_MODULES.map(({ id }) => id), ...(enabled.has("health") ? ["health" as const] : [])]))
                }
              >
                Enable all
              </button>
              <button onClick={() => setEnabled(new Set(enabled.has("health") ? ["health"] : []))}>Disable all</button>
            </div>
          </section>
          <section className="permission-list">
            {DEFAULT_MODULES.map((module) => (
              <article className="card permission-row" key={module.id}>
                <div className="permission-module-icon">{module.label[0]}</div>
                <div>
                  <h3>{module.label}</h3>
                  <p>{module.description}</p>
                </div>
                <div className="permission-state">
                  <span>
                    {enabled.has(module.id)
                      ? "Visible by default"
                      : "Internal only"}
                  </span>
                  <button
                    role="switch"
                    aria-checked={enabled.has(module.id)}
                    className={
                      enabled.has(module.id)
                        ? "permission-switch on"
                        : "permission-switch"
                    }
                    onClick={() =>
                      setEnabled((current) => {
                        const next = new Set(current);
                        next.has(module.id)
                          ? next.delete(module.id)
                          : next.add(module.id);
                        return next;
                      })
                    }
                  >
                    <i />
                  </button>
                </div>
              </article>
            ))}
            <h3 style={{gridColumn: "1 / -1"}}>Managed separately</h3>
            {BULK_FEATURES.filter(module => !DEFAULT_MODULES.some(item => item.id === module.id)).map(module => (
              <article className="card permission-row" key={module.id}>
                <div className="permission-module-icon">{module.label[0]}</div>
                <div>
                  <h3>{module.label}</h3>
                  <p>{module.description}</p>
                </div>
                <div className="permission-state">
                  <span>{module.id === "live_sales_monitor" ? "Live session" : "Users & roles"}</span>
                </div>
              </article>
            ))}
          </section>
          <div className="permission-savebar">
            <div>
              <b>{dirty ? "Unsaved changes" : "All changes saved"}</b>
              <span>Used by Customer accounts set to role defaults.</span>
            </div>
            <button disabled={!dirty || saving} onClick={saveDefaults}>
              {saving ? "Saving…" : "Save defaults"}
            </button>
          </div>
        </>
      )}

      {bulkAction && <div className="access-modal">
        <div className="access-editor card feature-release-confirm" role="dialog" aria-modal="true" aria-labelledby="bulk-access-title"
          onKeyDown={event => { if (event.key === "Escape" && !saving) setBulkAction(null); }}>
          <h3 id="bulk-access-title">{bulkAction === "grant" ? "Grant" : "Revoke"} access for {selectedUsers.length} {selectedUsers.length === 1 ? "user" : "users"}?</h3>
          <p>{bulkModule === "overview_leaderboard_all_stores" ? "Leaderboard · All stores" : ACCESS_MODULES.find(module => module.id === bulkModule)?.label} · Store access stays the same.</p>
          <p>{data?.users.filter(user => selectedUsers.includes(user.id)).map(user => user.displayName || user.email).join(", ")}</p>
          {bulkAction === "revoke" && <p>Users who inherit this feature switch to Custom access. They keep their other current modules and stop following future role defaults.
            {bulkModule === "overview" && " Overview sections also become unavailable."}</p>}
          {bulkAction === "grant" && bulkModule.startsWith("overview_") && bulkModule !== "overview_leaderboard_all_stores" && <p>Overview will also be enabled where needed.</p>}
          {bulkModule === "overview_leaderboard_all_stores" && <p>{bulkAction === "grant"
            ? "This applies to users with Custom access and Leaderboard enabled. It lets them see all participating stores on the Leaderboard."
            : "Users with Leaderboard access will return to their assigned stores on the board."}</p>}
          {bulkError && <p className="access-error" role="alert">{bulkError}</p>}
          <div className="feature-release-actions">
            <button autoFocus className="edit-access" disabled={saving} onClick={() => setBulkAction(null)}>Cancel</button>
            <button className="primary" disabled={saving} onClick={saveBulkAccess}>{saving ? "Saving…" : "Confirm"}</button>
          </div>
        </div>
      </div>}

      {releaseOpen&&<div className="access-modal" role="dialog" aria-modal="true" aria-labelledby="feature-release-title">
        <div className="access-editor card feature-release-confirm">
          <div className="access-editor-head"><div><p className="kicker">CONFIRM RELEASE</p><h3 id="feature-release-title">Release this feature to everyone?</h3></div><button aria-label="Close" disabled={saving} onClick={()=>setReleaseOpen(false)}>×</button></div>
          <p>This adds <b>{[...PORTAL_MODULES,OVERVIEW_LEADERBOARD_PERMISSION,OVERVIEW_STORE_SALES_PERMISSION].find(item=>item.id===releaseModule)?.label}</b> to every active non-Super Admin user. Their existing store access and other custom permissions stay unchanged.</p>
          <div className="feature-release-actions"><button type="button" className="edit-access" disabled={saving} onClick={()=>setReleaseOpen(false)}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={releaseFeature}>{saving?"Releasing…":"Confirm release"}</button></div>
        </div>
      </div>}

      {tab === "stores" && access?.canManageStores && (
        <>
          <section className="store-directory card" aria-labelledby="store-directory-title">
            <div className="directory-heading"><div><h3 id="store-directory-title">Stores <span>{data.stores.length}</span></h3></div><button type="button" className="directory-add" onClick={event=>{storeReturnFocusRef.current=event.currentTarget;setMessage("");setStoreError("");if(isSuperAdmin)setProjectEditor({});else setAddingStore(true);}}><span aria-hidden="true">＋</span> Add store</button></div>
            <div className="directory-filters">
              <label className="directory-search"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" aria-label="Search stores" placeholder="Search stores…" value={storeSearch} onInput={event=>setStoreSearch(event.currentTarget.value)} onChange={event=>setStoreSearch(event.target.value)}/></label>
              <select aria-label="Filter stores by country" value={storeCountry} onChange={event=>setStoreCountry(event.target.value as "all"|MarketCode)}><option value="all">All countries</option>{MARKET_CODES.map(market=><option key={market} value={market}>{MARKET_CONFIG[market].name}</option>)}</select>
              <select aria-label="Filter stores by service status" value={storeService} onChange={event=>setStoreService(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Paused</option><option value="ended">Service ended</option></select>
              {(storeSearch||storeCountry!=="all"||storeService!=="all")&&<button type="button" className="directory-clear" onClick={()=>{setStoreSearch("");setStoreCountry("all");setStoreService("all");}}>Reset</button>}
            </div>
            <table className="store-directory-table" aria-label="Store directory"><colgroup><col/><col className="directory-country-col"/><col className="directory-platform-col"/><col className="directory-status-col"/><col className="directory-actions-col"/></colgroup><thead><tr><th scope="col">Store</th><th scope="col" className="directory-country">Country</th><th scope="col" className="directory-platform">Platform</th><th scope="col">Service</th><th scope="col" className="directory-actions">Actions</th></tr></thead><tbody>
            {visibleStores.map(store=> (
              <tr key={store.id}><th scope="row"><span className="directory-store-name" title={store.name}>{store.name}</span><span className="directory-mobile-market">{marketFromPlatform(store.platform)} · Shopee</span></th>
                <td className="directory-country"><span className="directory-country-code">{marketFromPlatform(store.platform)}</span></td><td className="directory-platform">Shopee</td>
                <td><span className={`directory-status ${store.serviceStatus??"active"}`}><i aria-hidden="true"/>{store.serviceStatus==="ended"?"Ended":store.serviceStatus==="inactive"?"Paused":"Active"}</span></td>
                <td className="directory-actions"><div className="directory-row-actions">
                {isSuperAdmin&&<button type="button" className="directory-manage" aria-label={`Manage ${store.name}`} onClick={()=>setProjectEditor({storeId:store.id})}>Manage</button>}{!isSuperAdmin&&<button type="button" className="directory-manage" onClick={event=>beginStoreEdit(store,event.currentTarget)}>Edit</button>}
                <details className="directory-menu" onToggle={event=>{if(event.currentTarget.open)document.querySelectorAll<HTMLDetailsElement>('.directory-menu[open]').forEach(menu=>{if(menu!==event.currentTarget)menu.open=false;});}} onKeyDown={event=>{if(event.key==='Escape'&&!(event.target as Element).closest('dialog')){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label={`More actions for ${store.name}`}><span aria-hidden="true">⋯</span></summary><div className="directory-menu-panel">
                <button type="button" className="directory-menu-item" aria-label={`Edit details for ${store.name}`} onClick={event=>beginStoreEdit(store,event.currentTarget)}>Edit details</button>
                {isSuperAdmin&&<StoreStatusControl storeId={store.id} storeName={store.name} status={store.serviceStatus} triggerLabel="Change service status" onSaved={()=>{void loadUsers();onStoreChanged?.();}}/>}
                </div></details></div></td>
              </tr>
            ))}
            </tbody></table>
            {!visibleStores.length&&<div className="directory-empty"><strong>No stores found</strong><span>Try a different search or filter.</span></div>}
            <div className="directory-footer">{visibleStores.length} of {data.stores.length} stores</div>
          </section>
        </>
      )}

      {projectEditor&&<StoreProjectEditor initialStoreId={projectEditor.storeId} onClose={()=>setProjectEditor(null)} onSaved={()=>{void loadUsers();onStoreChanged?.();}}/>}
      {addingStore && (
        <div className="access-modal" role="dialog" aria-modal="true" aria-label="Add store" onKeyDown={handleStoreModalKeyDown}>
          <div className="access-editor card" ref={storeModalRef}>
            <div className="access-editor-head">
              <div><p className="kicker">NEW STORE</p><h3>Add store</h3></div>
              <button aria-label="Close" disabled={saving} onClick={closeStoreModal}>×</button>
            </div>
            <div className="access-form" aria-busy={saving}>
              <label>Store name<input ref={storeNameInputRef} maxLength={120} required value={newStore.name} onChange={event => updateNewStore({ name: event.target.value })} /></label>
              <label>Market<select value={newStore.market} onChange={event => {
                const market = event.target.value as MarketCode;
                if (market === newStore.market) return;
                updateNewStore({ market });
                setNewAccount(current => resetAccountSetupSelection(current, market));
              }}>{MARKET_CODES.map(market=><option key={market} value={market}>{MARKET_CONFIG[market].name} ({market})</option>)}</select></label>
              {newAccountPreview && <AccountSetupFields draft={newAccount} registeredNamesAvailable={data?.accountRegisteredNamesAvailable===true} market={accountMarket} update={updateNewAccount} />}
              <StoreExchangeRateField market={newStore.market} invoiceMonth={newAccount.effectiveMonth} onInvoiceMonthChange={month=>setNewAccount(current=>({...current,effectiveMonth:month}))} showInvoiceMonth={!newAccountPreview} />
              {newAccountPreview && accountSetupError(newAccount, accountMarket, plans) && <p className="store-field-error" role="status">{accountSetupError(newAccount, accountMarket, plans)}</p>}
              <StoreLinkFields draft={newStore} update={updateNewStore} idPrefix="add-store" />
              {accountSetupPreview && !accountSetupAvailable && <p className="store-access-note" role="status">Unlock Account to add a Store with its billing setup.</p>}
              {storeError && <p id="add-store-error" className="store-form-error" role="alert">{storeError}</p>}
              <button className="primary" disabled={saving || (accountSetupPreview && !accountSetupAvailable) || !newStore.name.trim() || (newAccountPreview && !!accountSetupError(newAccount, accountMarket, plans)) || newStore.projectLinks.some(projectLinkError)} aria-describedby={storeError ? "add-store-error" : undefined} onClick={addStore}>{saving ? "Adding…" : "Add store"}</button>
            </div>
          </div>
        </div>
      )}

      {editingStore && (
        <div className="access-modal" role="dialog" aria-modal="true" aria-label="Edit store" onKeyDown={handleStoreModalKeyDown}>
          <div className="access-editor card" ref={storeModalRef}>
            <div className="access-editor-head">
              <div><p className="kicker">STORE</p><h3>Edit store</h3></div>
              <button aria-label="Close" disabled={saving} onClick={closeStoreModal}>×</button>
            </div>
            <div className="access-form" aria-busy={saving}>
              <label>Store name<input ref={storeNameInputRef} maxLength={120} required value={storeDraft.name} onChange={event => updateStoreDraft({ name: event.target.value })} /></label>
              <StoreExchangeRateField market={marketFromPlatform(editingStore.platform)} invoiceMonth={editEntityMonth} onInvoiceMonthChange={setEditEntityMonth} showInvoiceMonth />
              {editAccountPreview && (editingStore.accountUnit ? <fieldset><legend>Registered names</legend><div className="account-rate-fields"><label>Registered Name (Platform)<input maxLength={240} value={editLegalEntity} onChange={event => { setStoreError(""); setEditLegalEntity(event.target.value); }} required /></label><label>Registered Name (Billing)<input maxLength={240} value={editBillingEntity} disabled={saving || !data?.accountRegisteredNamesAvailable} onChange={event => { setStoreError(""); setEditBillingEntity(event.target.value); }} />{editingStore.accountUnit.billingEntity && !editBillingEntity.trim() && <small>The saved billing name will be kept.</small>}</label><label>Effective invoice month<input type="month" min={malaysiaMonth()} value={editEntityMonth} onChange={event => { setStoreError(""); setEditEntityMonth(event.target.value); }} required /></label></div></fieldset> : <p className="store-access-note">{(editingStore.accountUnitCount ?? 0) > 1 ? "This store has multiple billing projects. Edit each company in Account." : "No Account setup is linked to this store yet. Set up its billing project in Account."}</p>)}
              <StoreLinkFields draft={storeDraft} update={updateStoreDraft} idPrefix="edit-store" />
              {accountSetupPreview && !accountSetupAvailable && <p className="store-access-note" role="status">Account setup is unavailable. Store details can still be saved.</p>}
              {storeError && <p id="edit-store-error" className="store-form-error" role="alert">{storeError}</p>}
              <button className="primary" disabled={saving || !storeDraft.name.trim() || storeDraft.projectLinks.some(projectLinkError)} aria-describedby={storeError ? "edit-store-error" : undefined} onClick={saveStore}>{saving ? "Saving…" : "Save store"}</button>
            </div>
          </div>
        </div>
      )}

      {(adding || editing) && (
        <div className="access-modal" role="dialog" aria-modal="true">
          <div className="access-editor card">
            <div className="access-editor-head">
              <div>
                <p className="kicker">
                  {adding ? "NEW ACCESS" : "USER ACCESS"}
                </p>
                <h3>
                  {adding
                    ? "Add portal user"
                    : editing?.displayName || editing?.email}
                </h3>
              </div>
              <button
                aria-label="Close"
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                  setUserError("");
                  userRequest.current = null;
                }}
              >
                ×
              </button>
            </div>
            {adding ? (
              <div className="access-form">
                <label>
                  Name
                  <input
                    value={newUser.displayName}
                    onChange={(e) =>
                      setNewUser({ ...newUser, displayName: e.target.value })
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) =>
                      setNewUser({ ...newUser, email: e.target.value })
                    }
                  />
                </label>
                {isSuperAdmin && <label>
                  Role
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser({ ...newUser, role: e.target.value as Role })
                    }
                  >
                    <option value="customer">Customer</option>
                    <option value="manager">Manager</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </label>}
                {userError && <p className="access-error" role="alert">{userError}</p>}
                <button
                  className="primary"
                  disabled={saving || !newUser.email}
                  onClick={addUser}
                >
                  {saving ? "Adding…" : "Add user"}
                </button>
              </div>
            ) : (
              editing && (
                <div className="access-form">
                  <div className={isSuperAdmin ? "form-two" : "form-one"}>
                    <label>
                      Display name
                      <input
                        value={editing.displayName}
                        onChange={(e) =>
                          updateEditing({ displayName: e.target.value })
                        }
                      />
                    </label>
                    {isSuperAdmin && <label>
                      Role
                      <select
                        value={editing.role}
                        onChange={(e) =>
                          updateEditing({ role: e.target.value as Role })
                        }
                      >
                        <option value="customer">Customer</option>
                        <option value="manager">Manager</option>
                        <option value="superadmin">Super Admin</option>
                      </select>
                    </label>}
                  </div>
                  <label className="account-toggle">
                    <input
                      type="checkbox"
                      checked={editing.active}
                      onChange={(e) =>
                        updateEditing({ active: e.target.checked })
                      }
                    />
                    <span>
                      <b>Account enabled</b>
                      <small>Disabled users cannot access this portal.</small>
                    </span>
                  </label>
                  {isSuperAdmin && editing.role !== "superadmin" && <label className="account-toggle">
                    <input type="checkbox" checked={editing.canManagePermissions} onChange={event => updateEditing({ canManagePermissions: event.target.checked })} />
                    <span><b>Permission Settings</b><small>Allow this user to manage access for assigned users.</small></span>
                  </label>}
                  <fieldset>
                    <legend>Store access</legend>
                    {editing.role==="customer"&&isSuperAdmin&&<p>Live Calendar requires explicitly selected stores for this customer. All stores does not grant calendar access.</p>}
                    {isSuperAdmin ? <div className="access-choice">
                      <button
                        className={
                          editing.storeAccessMode === "all" ? "active" : ""
                        }
                        onClick={() =>
                          updateEditing({ storeAccessMode: "all" })
                        }
                      >
                        All stores
                      </button>
                      <button
                        className={
                          editing.storeAccessMode === "selected" ? "active" : ""
                        }
                        onClick={() =>
                          updateEditing({ storeAccessMode: "selected" })
                        }
                      >
                        Selected stores
                      </button>
                    </div> : <p className="access-scope-note">Selected stores</p>}
                    {editing.storeAccessMode === "selected" && (
                      <>
                        <div className="access-bulk-actions">
                          <span>
                            {editing.storeIds.length} of {data?.stores.length ?? 0}{" "}
                            selected
                          </span>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                updateEditing({
                                  storeIds:
                                    data?.stores.filter(store=>editing.role==="superadmin"||!store.serviceStatus||store.serviceStatus==="active").map((store) => store.id) ?? [],
                                })
                              }
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => updateEditing({ storeIds: [] })}
                            >
                              Deselect all
                            </button>
                          </div>
                        </div>
                        <div className="access-check-grid">
                        {data?.stores.map((store) => (
                          <label key={store.id}>
                            <input
                              type="checkbox"
                              checked={editing.storeIds.includes(store.id)}
                              disabled={editing.role!=="superadmin"&&!!store.serviceStatus&&store.serviceStatus!=="active"}
                              onChange={() =>
                                updateEditing({
                                  storeIds: editing.storeIds.includes(store.id)
                                    ? editing.storeIds.filter(
                                        (id) => id !== store.id,
                                      )
                                    : [...editing.storeIds, store.id],
                                })
                              }
                            />
                            <span>
                              {store.name}
                              <small>{store.platform}{store.serviceStatus&&store.serviceStatus!=="active"?` · ${store.serviceStatus==="ended"?"Service ended":"Inactive"}`:""}</small>
                            </span>
                          </label>
                        ))}
                        </div>

                      </>
                    )}
                  </fieldset>
                  <fieldset>
                    <legend>Module access</legend>
                    {isSuperAdmin ? <div className="access-choice">
                      <button
                        className={
                          editing.moduleAccessMode === "role_default"
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          updateEditing({ moduleAccessMode: "role_default" })
                        }
                      >
                        Role defaults
                      </button>
                      <button
                        className={
                          editing.moduleAccessMode === "custom" ? "active" : ""
                        }
                        onClick={() =>
                          updateEditing({ moduleAccessMode: "custom" })
                        }
                      >
                        Custom access
                      </button>
                    </div> : <p className="access-scope-note">Custom access</p>}
                    {isSuperAdmin && editing.role !== "superadmin" && (
                      <button type="button" className="edit-access" onClick={() => updateEditing({
                        moduleAccessMode: "custom", enabledModules: [...STANDARD_CLIENT_MODULES],
                      })}>
                        Set four standard modules
                      </button>
                    )}
                    {editing.moduleAccessMode === "custom" && (
                      <>
                        <div className="access-bulk-actions">
                          <span>
                            {editing.enabledModules.filter(id=>id!=="overview_leaderboard_all_stores").length} of{" "}
                            {grantableModules.length} selected
                          </span>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                updateEditing({
                                  enabledModules: grantableModules.filter(module => module.id !== "health" || editing.enabledModules.includes("health")).map(
                                    (module) => module.id,
                                  ),
                                })
                              }
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateEditing({ enabledModules: [] })
                              }
                            >
                              Deselect all
                            </button>
                          </div>
                        </div>
                        <div className="access-check-grid modules">
                        {grantableModules.map((module) => (
                          <label key={module.id} style={module.id==="overview_leaderboard"||module.id==="overview_store_sales"?{paddingLeft:24}:undefined}>
                            <input
                              type="checkbox"
                              disabled={(module.id==="health"&&!editing.enabledModules.includes("health")) || ((module.id==="overview_leaderboard"||module.id==="overview_store_sales")&&!editing.enabledModules.includes("overview"))}
                              checked={editing.enabledModules.includes(
                                module.id,
                              )}
                              onChange={() =>
                                updateEditing({
                                  enabledModules:
                                    editing.enabledModules.includes(module.id)
                                      ? editing.enabledModules.filter(
                                          (id) => id !== module.id,
                                        )
                                      : [...editing.enabledModules, module.id],
                                })
                              }
                            />
                            <span>{module.label}{module.id === "health" && !editing.enabledModules.includes("health") ? " · Grant from Users & roles" : ""}</span>
                          </label>
                        ))}
                        </div>
                        {editing.enabledModules.includes("overview_leaderboard")&&<label>Leaderboard stores
                          <select value={editing.enabledModules.includes("overview_leaderboard_all_stores")?"all":"assigned"} onChange={event=>updateEditing({enabledModules:event.target.value==="all"?[...editing.enabledModules.filter(id=>id!=="overview_leaderboard_all_stores"),"overview_leaderboard_all_stores"]:editing.enabledModules.filter(id=>id!=="overview_leaderboard_all_stores")})}>
                            <option value="assigned">Assigned stores only</option>
                            {(isSuperAdmin||access?.grantableModules.includes("overview_leaderboard_all_stores"))&&<option value="all">All participating stores</option>}
                          </select>
                        </label>}
                      </>
                    )}
                  </fieldset>
                  {userError && <p className="access-error" role="alert">{userError}</p>}
                  <button
                    className="primary"
                    disabled={saving}
                    onClick={saveUser}
                  >
                    {saving ? "Saving…" : "Save user access"}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
