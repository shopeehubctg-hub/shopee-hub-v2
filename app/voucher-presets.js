export const VOUCHER_PRESET_SOURCE = {
  spreadsheetUrl:"https://docs.google.com/spreadsheets/d/1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k/edit",
  month:"Latest Avg.",
  metric:"Rounded Up Buffer",
  updated:"2026-09-23",
};

export const STORE_VOUCHER_PRESETS = {
  "Agepros":{normal:16,campaign:21}, "Berlanco":{normal:15,campaign:20}, "Beyoute":{normal:16,campaign:21},
  "Biotech":{normal:16,campaign:20}, "Bugucare":{normal:16,campaign:23}, "CTG4u":{normal:15,campaign:21},
  "Dr Smile":{normal:10,campaign:20}, "Eco Plus":{normal:18,campaign:27}, "Funffy":{normal:15,campaign:19},
  "GoHerb":{normal:15,campaign:21}, "ISOKAE":{normal:16,campaign:20}, "Jeeroul":{normal:15,campaign:22},
  "Jourish":{normal:15,campaign:15}, "Kata Marine":{normal:16,campaign:20}, "LivAct":{normal:16,campaign:21},
  "M+":{normal:15,campaign:21}, "MCS":{normal:15,campaign:20}, "MFormula":{normal:15,campaign:21},
  "MasterNerv":{normal:16,campaign:24}, "Mizino":{normal:15,campaign:19}, "Mizino Premium":{normal:15,campaign:20},
  "Moesie":{normal:15,campaign:19}, "Ninoko":{normal:15,campaign:23}, "NomoQ":{normal:14,campaign:19},
  "Recovit":{normal:16,campaign:23}, "Scale Gem":{normal:14,campaign:22}, "Scale Story":{normal:14,campaign:21},
  "SkinDae":{normal:15,campaign:21}, "SUPU":{normal:9,campaign:20}, "TGC":{normal:15,campaign:21},
  "URO360":{normal:16,campaign:20}, "YCT Herbal":{normal:15,campaign:20}, "Zeero":{normal:14,campaign:19},
  "iLady":{normal:16,campaign:22},
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
  "Yuan Chuan Tang Herbal by CTG4u":"YCT Herbal", "Zeero Skincare Official":"Zeero", "Supu":"SUPU",
};

export function voucherPresetFor(storeName="") {
  const key = STORE_ALIASES[storeName] ?? storeName;
  const preset = STORE_VOUCHER_PRESETS[key];
  return preset ? {store:key,...preset,available:true} : {store:storeName||"Selected store",normal:0,campaign:0,available:false};
}
