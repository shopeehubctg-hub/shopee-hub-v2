"use client";

import { useEffect, useRef, useState } from "react";
import { packageImageIssue } from "./package-image-validation";

export type PackageImageKind = "main" | "package";
export type PackageImageSelection = Partial<Record<PackageImageKind, File>>;
export type PackageImageValidation = "checking" | "rejected" | undefined;

function ImageField({ label, file, disabled, onChange, onValidationChange }: {
  label: string;
  file?: File;
  disabled: boolean;
  onChange: (file?: File) => void;
  onValidationChange?: (state: PackageImageValidation) => void;
}) {
  const [preview, setPreview] = useState("");
  const [issue, setIssue] = useState("");
  const [checking, setChecking] = useState(false);
  const selection = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { selection.current++; }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!file && !checking && inputRef.current) inputRef.current.value = "";
  }, [file, checking]);

  function clearSelection() {
    selection.current++;
    if (inputRef.current) inputRef.current.value = "";
    setIssue("");
    setChecking(false);
    onChange();
    onValidationChange?.(undefined);
  }

  return <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
    <label style={{ display: "grid", gap: 6 }}>
      <span>{label}</span>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-invalid={!!issue} disabled={disabled}
        onChange={async event => {
          const candidate = event.currentTarget.files?.[0];
          if (!candidate) return;
          const attempt = ++selection.current;
          onChange();
          setIssue("");
          setChecking(true);
          onValidationChange?.("checking");
          const error = await packageImageIssue(candidate).catch(() => "The image could not be read.");
          if (attempt !== selection.current) return;
          setChecking(false);
          if (error) {
            setIssue(error);
            onValidationChange?.("rejected");
            return;
          }
          onChange(candidate);
          onValidationChange?.(undefined);
        }} />
    </label>
    {checking && <small role="status">Checking image…</small>}
    {file && <small style={{ overflowWrap: "anywhere" }}>Ready to upload: {file.name}</small>}
    {issue && <p className="package-image-error" role="alert"><strong>Image rejected.</strong> {issue}</p>}
    {preview && <img src={preview} alt={label + " preview"} width={80} height={80} style={{ objectFit: "contain" }} />}
    {(file || issue || checking) && <button className="secondary" type="button" disabled={disabled}
      aria-label={`Clear ${label.toLowerCase()} selection`} onClick={clearSelection}>Clear selection</button>}
  </div>;
}

export function PackageImageFields({ images, onChange, onValidationChange, mizino, project, onProjectChange, disabled, projectLocked = false }: {
  images: PackageImageSelection;
  onChange: (kind: PackageImageKind, file?: File) => void;
  onValidationChange?: (kind: PackageImageKind, state: PackageImageValidation) => void;
  mizino: boolean;
  project: string;
  onProjectChange: (project: string) => void;
  projectLocked?: boolean;
  disabled: boolean;
}) {
  return <fieldset disabled={disabled}>
    <legend>Package Images</legend>
    <p><small>JPG, PNG or WebP · Square (1:1) · Under 2 MB each</small></p>
    {mizino && <label>Project
      <select disabled={projectLocked} value={project} onChange={event => onProjectChange(event.currentTarget.value)}>
        <option value="">Select project</option>
        <option>Mizino Placenta</option>
        <option>Mizino SlimPro</option>
      </select>
    </label>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      <ImageField label="Main image" file={images.main} disabled={disabled} onChange={file => onChange("main", file)} onValidationChange={state => onValidationChange?.("main", state)} />
      <ImageField label="Package image" file={images.package} disabled={disabled} onChange={file => onChange("package", file)} onValidationChange={state => onValidationChange?.("package", state)} />
    </div>
  </fieldset>;
}
