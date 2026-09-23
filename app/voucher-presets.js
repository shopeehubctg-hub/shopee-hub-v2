export const VOUCHER_PRESET_SOURCE = {
  spreadsheetUrl:"https://docs.google.com/spreadsheets/d/1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k/edit",
  month:"Latest Avg.",
  metric:"Average Voucher Rate",
  updated:"2026-09-23",
};

export const STORE_VOUCHER_PRESETS = {
  "Agepros":{normal:15.62,campaign:20.05}, "Berlanco":{normal:14.08,campaign:19.36}, "Beyoute":{normal:15.20,campaign:20.65},
  "Biotech":{normal:15.75,campaign:19.08}, "Bugucare":{normal:15.83,campaign:22.19}, "CTG4u":{normal:14.65,campaign:20.15},
  "Dr Smile":{normal:10.00,campaign:19.82}, "Eco Plus":{normal:17.61,campaign:26.16}, "Funffy":{normal:15.00,campaign:18.65},
  "GoHerb":{normal:14.51,campaign:20.21}, "ISOKAE":{normal:15.51,campaign:19.88}, "Jeeroul":{normal:15.00,campaign:21.39},
  "Jourish":{normal:14.02,campaign:14.89}, "Kata Marine":{normal:15.02,campaign:19.79}, "LivAct":{normal:15.01,campaign:20.30},
  "M+":{normal:15.00,campaign:20.62}, "MCS":{normal:14.38,campaign:19.50}, "MFormula":{normal:14.02,campaign:20.14},
  "MasterNerv":{normal:15.06,campaign:23.07}, "Mizino":{normal:14.14,campaign:18.99}, "Mizino Premium":{normal:14.02,campaign:19.26},
  "Moesie":{normal:14.03,campaign:18.87}, "Ninoko":{normal:14.07,campaign:22.51}, "NomoQ":{normal:13.78,campaign:18.69},
  "Recovit":{normal:15.28,campaign:22.92}, "Scale Gem":{normal:13.23,campaign:21.22}, "Scale Story":{normal:13.91,campaign:20.88},
  "SkinDae":{normal:14.62,campaign:20.11}, "SUPU":{normal:9.00,campaign:20.00}, "TGC":{normal:14.71,campaign:20.53},
  "URO360":{normal:15.02,campaign:19.85}, "YCT Herbal":{normal:14.17,campaign:19.86}, "Zeero":{normal:13.81,campaign:18.52},
  "iLady":{normal:15.44,campaign:21.65},
};

const STORE_ALIASES = {
  "AgePros By Swissmed":"Agepros", "Berlanco Beauty Official":"Berlanco", "Beyoute Official Store":"Beyoute", "BioTech by Swissmed":"Biotech",
  "Naturelish Bugucare by CTG4u":"Bugucare", "CTG4u Malaysia":"CTG4u", "Dr Smile Whitening by CTG4u":"Dr Smile",
  "Naturelish Eco Plus by CTG4u":"Eco Plus", "Funffy by CTG4u":"Funffy", "GoHerb Official Store":"GoHerb",
  "Naturelish Isokae by CTG4u":"ISOKAE", "iLady Haircare by CTG4u":"iLady",
  "Jeeroul by CTG4u":"Jeeroul", "Jourish Natural Wellness":"Jourish", "Kata Skincare Malaysia":"Kata Marine",
  "LivAct Official Store":"LivAct", "M+ SkinPro by CTG4u":"M+", "Master Nerv Official Store":"MasterNerv",
  "MCS Skincare by CTG4u":"MCS", "MFormula Official":"MFormula", "Mizino Official Store":"Mizino",
  "Moesie Malaysia":"Moesie", "NINOKO Official Store":"Ninoko", "NomoQ by CTG4u":"NomoQ",
  "NatureLish Recovit by CTG4u":"Recovit", "Scale Gem Collagen by CTG4u":"Scale Gem",
  "Scale Story Official Store":"Scale Story", "SkinDae MY by CTG4u":"SkinDae",
  "True Golden Care by Naturelish":"TGC", "Naturelish Uro360 by CTG4u":"URO360",
  "Yuan Chuan Tang Herbal by CTG4u":"YCT Herbal", "Zeero Skincare Official":"Zeero", "Supu":"SUPU", "SUPU • 食补":"SUPU",
};

export function voucherPresetFor(storeName="") {
  const key = STORE_ALIASES[storeName] ?? storeName;
  const preset = STORE_VOUCHER_PRESETS[key];
  return preset ? {store:key,...preset,available:true} : {store:storeName||"Selected store",normal:0,campaign:0,available:false};
}
