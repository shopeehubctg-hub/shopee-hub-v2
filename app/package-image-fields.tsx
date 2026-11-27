"use client";

import { useEffect, useRef, useState } from "react";
import { packageImageIssue } from "./package-image-validation";

export type PackageImageKind = "main" | "package";
export type PackageImageSelection = Partial<Record<PackageImageKind, File>>;

function ImageField({ label, file, disabled, onChange }: {
  label: string;
  file?: File;
  disabled: boolean;
  onChange: (file?: File) => void;
}) {
  const [preview, setPreview] = useState("");
  const [issue, setIssue] = useState("");
  const selection = useRef(0);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <label style={{ display: "grid", gap: 6 }}>
    <span>{label}</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={async event => {
        const input = event.currentTarget;
        const candidate = input.files?.[0];
        if (!candidate) return;
        const attempt = ++selection.current;
        setIssue("");
        const error = await packageImageIssue(candidate).catch(() => "The image could not be read.");
        if (attempt !== selection.current) return;
        if (error) {
          input.value = "";
          setIssue(error);
          return;
        }
        onChange(candidate);
      }} />
    {file && <small style={{ overflowWrap: "anywhere" }}>Selected: {file.name}</small>}
    {issue && <small role="alert">{issue}</small>}
    {preview && <img src={preview} alt={label + " preview"} width={80} height={80} style={{ objectFit: "contain" }} />}
  </label>;
}

export function PackageImageFields({ images, onChange, mizino, project, onProjectChange, disabled, projectLocked = false }: {
  images: PackageImageSelection;
  onChange: (kind: PackageImageKind, file?: File) => void;
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
      <ImageField label="Main image" file={images.main} disabled={disabled} onChange={file => onChange("main", file)} />
      <ImageField label="Package image" file={images.package} disabled={disabled} onChange={file => onChange("package", file)} />
    </div>
  </fieldset>;
}
