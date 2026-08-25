"use client";

import { useEffect, useMemo, useState } from "react";
import { PORTAL_MODULES, type PortalModuleId } from "./module-permissions";

type Props = { initialEnabledModules: PortalModuleId[] };
type Role = "customer" | "manager" | "superadmin";
type Store = { id: string; name: string; platform: string };
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
};
type UserData = {
  users: PortalUser[];
  stores: Store[];
  clientDefaults: PortalModuleId[];
};

export function PermissionSettings({ initialEnabledModules }: Props) {
  const [tab, setTab] = useState<"users" | "modules">("users");
  const [enabled, setEnabled] = useState(new Set(initialEnabledModules));
  const [saved, setSaved] = useState(new Set(initialEnabledModules));
  const [data, setData] = useState<UserData | null>(null);
  const [editing, setEditing] = useState<PortalUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({
    displayName: "",
    email: "",
    role: "customer" as Role,
  });
  const dirty = useMemo(
    () => PORTAL_MODULES.some(({ id }) => enabled.has(id) !== saved.has(id)),
    [enabled, saved],
  );
  async function loadUsers() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    if (response.ok) setData(await response.json());
  }
  useEffect(() => {
    loadUsers();
  }, []);
  useEffect(() => {
    const next = new Set(initialEnabledModules);
    setEnabled(next);
    setSaved(next);
  }, [initialEnabledModules]);
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
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const result = await response
        .json()
        .catch(() => ({ error: "The server returned an invalid response" }));
      if (!response.ok) {
        setMessage(result.error ?? "Unable to add user");
        return;
      }
      setData(result);
      setAdding(false);
      setNewUser({ displayName: "", email: "", role: "customer" });
      setMessage("User access created.");
    } catch {
      setMessage("Unable to add user. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  async function saveUser() {
    if (!editing) return;
    setSaving(true);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error ?? "Unable to update user");
      return;
    }
    setData(result);
    setEditing(null);
    setMessage("User access updated.");
  }
  const users =
    data?.users.filter((user) =>
      `${user.displayName} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  function updateEditing(patch: Partial<PortalUser>) {
    setEditing((current) => (current ? { ...current, ...patch } : current));
  }
  return (
    <div className="permission-page">
      <section className="permission-hero">
        <div>
          <p className="kicker">SUPER ADMIN</p>
          <h2>User Access Management</h2>
          <p>
            Manage portal users, roles, account status, store access and
            individual module permissions from one place.
          </p>
        </div>
        <span className="superadmin-badge">Super Admin</span>
      </section>
      <div className="access-tabs">
        <button
          className={tab === "users" ? "active" : ""}
          onClick={() => setTab("users")}
        >
          Users & roles
        </button>
        <button
          className={tab === "modules" ? "active" : ""}
          onClick={() => setTab("modules")}
        >
          Client module defaults
        </button>
      </div>
      {message && <div className="access-message">{message}</div>}

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
            <button onClick={() => setAdding(true)}>+ Add user</button>
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
                  onClick={() => setEditing({ ...user })}
                >
                  Manage
                </button>
              </article>
            ))}
          </section>
        </>
      )}

      {tab === "modules" && (
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
                <label>
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
                </label>
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
                  <div className="form-two">
                    <label>
                      Display name
                      <input
                        value={editing.displayName}
                        onChange={(e) =>
                          updateEditing({ displayName: e.target.value })
                        }
                      />
                    </label>
                    <label>
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
                    </label>
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
                  <fieldset>
                    <legend>Store access</legend>
                    <div className="access-choice">
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
                    </div>
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
                    <div className="access-choice">
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
                    </div>
                    {editing.moduleAccessMode === "custom" && (
                      <>
                        <div className="access-bulk-actions">
                          <span>
                            {editing.enabledModules.length} of{" "}
                            {PORTAL_MODULES.length} selected
                          </span>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                updateEditing({
                                  enabledModules: PORTAL_MODULES.map(
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
                        {PORTAL_MODULES.map((module) => (
                          <label key={module.id}>
                            <input
                              type="checkbox"
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
                      </>
                    )}
                  </fieldset>
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
