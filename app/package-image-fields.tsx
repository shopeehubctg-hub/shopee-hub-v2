"use client";

import { useEffect, useState } from "react";

export type PackageImageKind = "main" | "package";
export type PackageImageSelection = Partial<Record<PackageImageKind, File>>;

function ImageField({ label, file, disabled, onChange }: {
  label: string;
  file?: File;
  disabled: boolean;
  onChange: (file?: File) => void;
}) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <label style={{ display: "grid", gap: 6 }}>
    <span>{label}</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={event => onChange(event.currentTarget.files?.[0])} />
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
