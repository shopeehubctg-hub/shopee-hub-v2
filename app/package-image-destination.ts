import { projectDriveFolders } from "./project-drive-folders";

const mizinoMediaFolders = {
  "Mizino Placenta": "1vBEhKK5-aIVZsVeF1fs6lm6UVaZM-LqZ",
  "Mizino SlimPro": "1A9kr73SZmuEkJaUSObVnoKh1Q9zNRfcL",
} as const;

/** Resolve only after validating the store and project against the package owner. */
export function packageImageDestination(storeName: string, market: string, project?: string) {
  if (market !== "MY") return null;
  if (storeName === "Mizino Premium") {
    return project === "Mizino Placenta" || project === "Mizino SlimPro"
      ? mizinoMediaFolders[project]
      : null;
  }
  if (project || !Object.hasOwn(projectDriveFolders, storeName)) return null;
  return /^https:\/\/drive\.google\.com\/drive\/folders\/([\w-]+)$/
    .exec(projectDriveFolders[storeName].imageResources)?.[1] ?? null;
}

export function packageImageName(name: string, kind: "main" | "package", extension: "jpg" | "png" | "webp") {
  const label = name.replace(/[\\/\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return `${Array.from(label || "Package").slice(0, 150).join("")} — ${kind.toUpperCase()}.${extension}`;
}
