export const VOUCHER_PRESET_SOURCE = {
  spreadsheetUrl:"https://docs.google.com/spreadsheets/d/1pzXhiklrLR6lrXlxj9zhYumUKw5FxXT3/edit",
  month:"Last Month Avg.",
  metric:"Rounded Up Buffer",
  updated:"2026-08-05",
};

export const STORE_VOUCHER_PRESETS = {
  "Agepros":{normal:14,campaign:19}, "Beyoute":{normal:14,campaign:20}, "Biotech":{normal:9,campaign:23},
  "Bugucare":{normal:15,campaign:20}, "CTG4u":{normal:16,campaign:21}, "Dr Smile":{normal:11,campaign:19},
  "Eco Plus":{normal:9,campaign:25}, "Funffy":{normal:15,campaign:24}, "iProCare":{normal:13,campaign:22},
  "ISOKAE":{normal:18,campaign:21}, "Jeeroul":{normal:15,campaign:17}, "Jourish":{normal:14,campaign:22},
  "Kata Marine":{normal:14,campaign:19}, "LivAct":{normal:13,campaign:21}, "M+":{normal:14,campaign:20},
  "MasterNerv":{normal:13,campaign:20}, "MCS":{normal:14,campaign:22}, "MFormula":{normal:14,campaign:19},
  "Mizino":{normal:12,campaign:19}, "Mizino Premium":{normal:13,campaign:20}, "Moesie":{normal:13,campaign:19},
  "Ninoko":{normal:14,campaign:21}, "NomoQ":{normal:13,campaign:19}, "Recovit":{normal:15,campaign:24},
  "Scale Gem":{normal:14,campaign:23}, "Scale Story":{normal:14,campaign:18}, "SkinDae":{normal:14,campaign:21},
  "TGC":{normal:15,campaign:21}, "URO360":{normal:15,campaign:21}, "YCT Herbal":{normal:14,campaign:19},
  "Zeero":{normal:11,campaign:19},
};

const STORE_ALIASES = {
  "AgePros By Swissmed":"Agepros", "Beyoute Official Store":"Beyoute", "BioTech by Swissmed":"Biotech",
  "Naturelish Bugucare by CTG4u":"Bugucare", "CTG4u Malaysia":"CTG4u", "Dr Smile Whitening by CTG4u":"Dr Smile",
  "Naturelish Eco Plus by CTG4u":"Eco Plus", "Funffy by CTG4u":"Funffy", "Naturelish Isokae by CTG4u":"ISOKAE",
  "Jeeroul by CTG4u":"Jeeroul", "Jourish Natural Wellness":"Jourish", "Kata Skincare Malaysia":"Kata Marine",
  "LivAct Official Store":"LivAct", "M+ SkinPro by CTG4u":"M+", "Master Nerv Official Store":"MasterNerv",
  "MCS Skincare by CTG4u":"MCS", "MFormula Official":"MFormula", "Mizino Official Store":"Mizino",
  "Moesie Malaysia":"Moesie", "NINOKO Official Store":"Ninoko", "NomoQ by CTG4u":"NomoQ",
  "NatureLish Recovit by CTG4u":"Recovit", "Scale Gem Collagen by CTG4u":"Scale Gem",
  "Scale Story Official Store":"Scale Story", "SkinDae MY by CTG4u":"SkinDae",
  "True Golden Care by Naturelish":"TGC", "Naturelish Uro360 by CTG4u":"URO360",
  "Yuan Chuan Tang Herbal by CTG4u":"YCT Herbal", "Zeero Skincare Official":"Zeero",
};

export function voucherPresetFor(storeName="") {
  const key = STORE_ALIASES[storeName] ?? storeName;
  const preset = STORE_VOUCHER_PRESETS[key];
  return preset ? {store:key,...preset,available:true} : {store:storeName||"Selected store",normal:0,campaign:0,available:false};
}
