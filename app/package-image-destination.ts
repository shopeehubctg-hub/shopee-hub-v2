import { projectDriveFolders } from "./project-drive-folders";

const mizinoDashboardUploadFolders = {
  "Mizino Placenta": "1valUQZyuRzINfCJ6Hsl9xVvL0qrnoTqj",
  "Mizino SlimPro": "1Lg6EqDIBcJNYzHox2HTuclLRXqOG7Hih",
} as const;

/** Resolve only after validating the store and project against the package owner. */
export function packageImageDestination(storeName: string, market: string, project?: string) {
  if (market !== "MY") return null;
  if (storeName === "Mizino Premium") {
    return project === "Mizino Placenta" || project === "Mizino SlimPro"
      ? mizinoDashboardUploadFolders[project]
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
