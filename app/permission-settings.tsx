"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { StoreExchangeRateField } from "./store-exchange-rate-field";
import { MARKET_CODES, MARKET_CONFIG, marketFromPlatform, type MarketCode } from "./markets";
import { useFeePlans } from "./fee-plan-context";
import { PORTAL_MODULES, OVERVIEW_LEADERBOARD_PERMISSION, type PortalModuleId } from "./module-permissions";
import { AccountSetupFields, accountSetupError, emptyAccountSetup, accountSetupPayload, resetAccountSetupSelection, malaysiaMonth, type AccountSetupDraft } from "./store-account-setup-fields";

type Props = { accountSetupPreview?:boolean; initialEnabledModules: PortalModuleId[]; onStoreChanged?: () => void };
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
type Store = { id: string; name: string; platform: string; bigseller_name?: string; accountUnit?: { rosterKey: string; legalEntity: string; latestVersion: string } | null; accountUnitCount?: number } & Partial<StoreLinks>;
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
type PermissionAccess = { isSuperAdmin: boolean; canManageStores: boolean; canManageDefaults: boolean; grantableModules: PortalModuleId[] };
type UserData = {
  users: PortalUser[];
  stores: Store[];
  clientDefaults: PortalModuleId[];
  accountSettingsAvailable: boolean;
  access: PermissionAccess;
};

export function PermissionSettings({ initialEnabledModules, onStoreChanged, accountSetupPreview=false }: Props) {
  const { plans } = useFeePlans();
  const [tab, setTab] = useState<"users" | "stores" | "modules">("users");
  const [enabled, setEnabled] = useState(new Set(initialEnabledModules));
  const [saved, setSaved] = useState(new Set(initialEnabledModules));
  const [data, setData] = useState<UserData | null>(null);
  const [editing, setEditing] = useState<PortalUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [userError, setUserError] = useState("");
  const [storeError, setStoreError] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [addingStore, setAddingStore] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeDraft, setStoreDraft] = useState<StoreDraft>(emptyStoreDraft);
  const [newStore, setNewStore] = useState<StoreDraft>(emptyStoreDraft);
  const [newAccount, setNewAccount] = useState<AccountSetupDraft>(emptyAccountSetup);
  const [editLegalEntity, setEditLegalEntity] = useState("");
  const [editEntityMonth, setEditEntityMonth] = useState(malaysiaMonth);
  const storeRequest = useRef<{ payload: string; id: string } | null>(null);
  const userRequest = useRef<{ payload: string; id: string } | null>(null);
  const storeModalRef = useRef<HTMLDivElement>(null);
  const storeNameInputRef = useRef<HTMLInputElement>(null);
  const storeReturnFocusRef = useRef<HTMLButtonElement | null>(null);
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
  const grantableModules = [PORTAL_MODULES[0],OVERVIEW_LEADERBOARD_PERMISSION,...PORTAL_MODULES.slice(1)].filter(module=>isSuperAdmin||access?.grantableModules.includes(module.id));
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
    const companyChanged = editAccountPreview && !!editingStore.accountUnit && editLegalEntity.trim() !== editingStore.accountUnit.legalEntity;
    if (companyChanged && (!editLegalEntity.trim() || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(editEntityMonth) || editEntityMonth < malaysiaMonth())) {
      setStoreError("Enter a legal company name and current or future effective month.");
      return;
    }
    setStoreError("");
    setSaving(true);
    try {
      const payload = { id: editingStore.id, ...storeDraft, adsTopUpOwner: storeDraft.adsTopUpOwner || null,
        ...(companyChanged && editingStore.accountUnit ? { legalEntity: editLegalEntity.trim(), effectiveMonth: editEntityMonth, accountRosterKey: editingStore.accountUnit.rosterKey, expectedAccountVersion: editingStore.accountUnit.latestVersion } : {}) };
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
        enabledModules: isSuperAdmin ? editing.enabledModules : editing.enabledModules.filter(id => access?.grantableModules.includes(id)),
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
  const users =
    data?.users.filter((user) =>
      `${user.displayName} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  function updateEditing(patch: Partial<PortalUser>) {
    setEditing((current) => {
      if (!current) return current;
      const next={...current,...patch,...(!isSuperAdmin ? { role: current.role, canManagePermissions: current.canManagePermissions, moduleAccessMode: "custom" as const, storeAccessMode: "selected" as const } : {})};
      if(!next.enabledModules.includes("overview"))next.enabledModules=next.enabledModules.filter(id=>id!=="overview_leaderboard"&&id!=="overview_leaderboard_all_stores");
      if(!next.enabledModules.includes("overview_leaderboard"))next.enabledModules=next.enabledModules.filter(id=>id!=="overview_leaderboard_all_stores");
      if (next.role === "superadmin") next.canManagePermissions = false;
      if(next.role==="customer"&&patch.enabledModules?.includes("live_calendar")&&next.storeAccessMode==="all")
        return {...next,storeAccessMode:"selected",storeIds:[]};
      return next;
    });
  }
  if (!data) return <div className="permission-page"><section className="permission-hero"><div><p className="kicker">PERMISSION SETTINGS</p><h2>User Access Management</h2></div></section>{loadError?<div className="access-error" role="alert">{loadError} <button type="button" onClick={loadUsers}>Retry</button></div>:<div className="access-toolbar card" role="status" aria-busy="true">Loading permissions…</div>}</div>;
  return (
    <div className="permission-page">
      <section className="permission-hero">
        <div>
          <p className="kicker">{isSuperAdmin ? "SUPER ADMIN" : "PERMISSION SETTINGS"}</p>
          <h2>User Access Management</h2>
          <p>
            Manage portal users, roles, account status, store access and
            individual module permissions from one place.
          </p>
        </div>
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
              onChange={(event) => setSearch(event.target.value)}
            />
            <button disabled={!data} onClick={() => { setUserError(""); setAdding(true); }}>+ Add user</button>
          </section>
          <section className="user-access-list">
            {users.map((user) => (
              <article
                className={`card user-access-row${user.active ? "" : " inactive"}`}
                key={user.id}
              >
                <div className="user-avatar">
                  {(user.displayName || user.email).slice(0, 1).toUpperCase()}
                </div>
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
          <section className="permission-summary card">
            <div>
              <span>Default customer access</span>
              <strong>
                {enabled.size} of {PORTAL_MODULES.length} modules
              </strong>
            </div>
            <div className="permission-quick-actions">
              <button
                onClick={() =>
                  setEnabled(new Set(PORTAL_MODULES.map(({ id }) => id)))
                }
              >
                Enable all
              </button>
              <button onClick={() => setEnabled(new Set())}>Disable all</button>
            </div>
          </section>
          <section className="permission-list">
            {PORTAL_MODULES.map((module) => (
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

      {tab === "stores" && access?.canManageStores && (
        <>
          <section className="access-toolbar card">
            <div>
              <strong>{data?.stores.length ?? 0} registered stores</strong>
              <span>Add a store to make it available in the portal.</span>
            </div>
            <span className="store-access-note">Customer visibility is managed separately under Users & roles.</span>
            <button disabled={!data} onClick={event => { storeReturnFocusRef.current = event.currentTarget; setMessage(""); setStoreError(""); setAddingStore(true); }}>+ Add store</button>
          </section>
          <section className="store-access-list">
            {data?.stores.map(store => (
              <article className="card store-access-row" key={store.id}>
                <div>
                  <h3>{store.name}</h3>
                </div>
                <span>{store.platform}</span>
                <button className="edit-access" onClick={event => {
                  storeReturnFocusRef.current = event.currentTarget;
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
                  setEditEntityMonth(malaysiaMonth());
                }}>Edit store</button>
              </article>
            ))}
          </section>
        </>
      )}

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
              {newAccountPreview && <AccountSetupFields draft={newAccount} market={accountMarket} update={updateNewAccount} />}
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
              {editAccountPreview && (editingStore.accountUnit ? <fieldset><legend>Account company</legend><div className="account-rate-fields"><label className="account-field-wide">Company name<input maxLength={240} value={editLegalEntity} onChange={event => { setStoreError(""); setEditLegalEntity(event.target.value); }} required /></label><label>Effective invoice month<input type="month" min={malaysiaMonth()} value={editEntityMonth} onChange={event => { setStoreError(""); setEditEntityMonth(event.target.value); }} required /></label></div></fieldset> : <p className="store-access-note">{(editingStore.accountUnitCount ?? 0) > 1 ? "This store has multiple billing projects. Edit each company in Account." : "No Account setup is linked to this store yet. Set up its billing project in Account."}</p>)}
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
                                    data?.stores.map((store) => store.id) ?? [],
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
                              <small>{store.platform}</small>
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
                                  enabledModules: grantableModules.map(
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
                          <label key={module.id} style={module.id==="overview_leaderboard"?{paddingLeft:24}:undefined}>
                            <input
                              type="checkbox"
                              disabled={module.id==="overview_leaderboard"&&!editing.enabledModules.includes("overview")}
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
                            <span>{module.label}</span>
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
