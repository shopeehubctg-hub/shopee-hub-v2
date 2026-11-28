const dashboardUploadFolders: Readonly<Record<string, string | Readonly<Record<string, string>>>> = {
  "AgePros By Swissmed": "1so2J5MZAtnT8egptFAicJSfTHq42Hhh-",
  "Berlanco Beauty Official": "1DE2KoP1m1XYigrlaOQ6wu7o6uVi5UT-4",
  "Beyoute Official Store": "1IZIos1I2Mnb0cb38oP7sN8IO8oIqG0kC",
  "BioTech by Swissmed": "1UB3RY2B43zde2nSx6nLBiT85M4Ecfkla",
  "Bonlife Official Store": "1ESRmy4pqDxES0hWeLNlKxmxyPSFZocVH",
  "CTG4u Malaysia": "1V9S9emV-tmRLo7Walph053btpJwpU_me",
  "Daionica Official Store": "1bSZFLdALmC8KaV_WzTt2VN5gms30dKiX",
  "Dancoly Paris HQ": "1mdIWbemQF3OUlKHyCwDNHsdjcL8NpIzo",
  "Dr Smile Whitening by CTG4u": "1XqO0TUNoksfs5Asgz7NTTz9IE2Mp_dxK",
  "Funffy by CTG4u": "122zZNOD9oWAw7TO4hRHeYLe-8_zEXyav",
  "GoHerb Official Store": "1t9m-vl7eYA7rzZ-sW3eMlUq3BRspTYk8",
  "Hair Factory Official": "1QCTH9y_HheiFMmwi0kS3utRuQ7XVswqU",
  "iLady Haircare by CTG4u": "1CdRTJKcFG8M24CVfI8h6bosA0WCjYWgS",
  "J Packaging": "18Mup6d__pTNyqoKdxvkfdHO4_FLeLwzv",
  "Jeeroul by CTG4u": "1jwU_CvY_v2Vzfj4FZj5TcPLPDviio1SV",
  "Jen Mommy Essential Oil": "1TDhABUaDISqasUCi7y2n7MoiAcqsuoma",
  "Jourish Natural Wellness": "1Rq3RMafON1OUuhVVmcN4QKyByghFXa3p",
  "Kata Skincare Malaysia": "1JCHVroSqAFzi6AxwisJWnjlZdsmEhUK6",
  "LivAct Official Store": "19zXJSXPXyrr241K9wr1DKg57FHDoBfdf",
  "M+ SkinPro by CTG4u": "14WlohVT4rpz1YQI6gRwI9atY6drP1nmY",
  "Master Nerv Official Store": "1QYiuio0usd-wF2mPPSR2th38DWNFMCOq",
  "MCS Skincare by CTG4u": "13TZAJjbDvGz7DF3g5RfJhfspToNFxVZd",
  "MFormula Official": "1oK4xsMxdV2GTsMST7FzZB6HXNqIR3f21",
  "Mizino Official Store": "1z0swI2miLvU2SiGT8l5c_NgvbhWP08vN",
  "Mizino Premium": {
    "Mizino Placenta": "1valUQZyuRzINfCJ6Hsl9xVvL0qrnoTqj",
    "Mizino SlimPro": "1Lg6EqDIBcJNYzHox2HTuclLRXqOG7Hih"
  },
  "Moesie Malaysia": "1T_5YHwdvbdbYUfggR8YlJiB66s7cd11g",
  "Naturelish Bugucare by CTG4u": "1c2TPheYYIeR9u3TzEoIcyqxyeO4M-htv",
  "Naturelish Eco Plus by CTG4u": "1LVAusee6kAyXDv8e3KmiH0AeJvkZZHFG",
  "Naturelish Humeal by CTG4u": "1HSmCi3woLi3O2pFj1KbmD71xNJGRA_nx",
  "Naturelish Isokae by CTG4u": "1wYS5YNGhjKzBYB-0NzbMBQ5oCokpqBQk",
  "NatureLish Recovit by CTG4u": "1AJyt6lIgSNbLtzlee2DVOFAvEzE4T-oW",
  "Naturelish Uro360 by CTG4u": "1AMKEOTS0jL61OtXD5UEpA_HFctbZB4QF",
  "NINOKO Official Store": "1K1HrOmxwJf8aldaulVfrXZ1AGsiQdW17",
  "NomoQ by CTG4u": "1Rjw6Y-7nGG6JySV197WmQaiPDyzXX0Jt",
  "PAW PAWs Official": "16xjyOqs1xNXSyMSsiA621Ycu0fDrIsYw",
  "Petavit Official Store": "18X5hZPC7nTwibifAKOiOPtE5PaPVxI4Y",
  "Scale Gem Collagen by CTG4u": "1-XYVjFRgB4nVQI-YJBZCbS_GAuf1JwaZ",
  "Scale Story Official Store": "1kKv_k8utzOmXHZCT3Jmk9yXqLksDcG4v",
  "SkinDae MY by CTG4u": "15apeBzJzYQ9Mqve3L8sse0Jf9zTLeDqa",
  "Supu": "1jsBrtLgidbYsHUoLxyfm9DhREShYl_FR",
  "True Golden Care by Naturelish": "1iAL4mFifO4xSSaIdOTSOoDtaecp7fBO8",
  "White Skin Care": "1Tq-LMqAkysy9z4DPt4JHaMZlJ0DfRkSV",
  "Yuan Chuan Tang Herbal by CTG4u": "1qSlpVEJR3D0mzm6Liw2hQcPnfc5o6cGm",
  "Zeero Skincare Official": "1IPuDsD3vO-uILdSoRASyX3sdDedHSrOE"
};

export function packageImageDestinations() {
  return Object.entries(dashboardUploadFolders).flatMap(([storeName, folders]) =>
    typeof folders === "string"
      ? [{ project: storeName, folder: folders }]
      : Object.entries(folders).map(([project, folder]) => ({ project, folder })),
  );
}

/** Resolve only after validating the store and project against the package owner. */
export function packageImageDestination(storeName: string, market: string, project?: string) {
  if (market !== "MY" || !Object.hasOwn(dashboardUploadFolders, storeName)) return null;
  const folders = dashboardUploadFolders[storeName];
  if (typeof folders === "string") return project ? null : folders;
  return project && Object.hasOwn(folders, project) ? folders[project] : null;
}

export function packageImageName(name: string, kind: "main" | "package", extension: "jpg" | "png" | "webp") {
  const label = name.replace(/[\\/\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return `${Array.from(label || "Package").slice(0, 150).join("")} — ${kind.toUpperCase()}.${extension}`;
}
