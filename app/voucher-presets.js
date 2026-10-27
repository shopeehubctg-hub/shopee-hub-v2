export const VOUCHER_PRESET_SOURCE = {
  spreadsheetUrl:"https://docs.google.com/spreadsheets/d/1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k/edit",
  month:"Final tab",
  metric:"Average 顾客可用到的Voucher",
  updated:"2026-10-07",
};

export const STORE_VOUCHER_PRESETS = {
  "Agepros":{normal:7,campaign:19}, "Berlanco Beauty Official":{normal:16,campaign:22},
  "Beyoute":{normal:11,campaign:22}, "Biotech":{normal:18,campaign:19},
  "Bugucare":{normal:15,campaign:22}, "CTG4u":{normal:19,campaign:20}, "Dr Smile":{normal:6,campaign:18},
  "Eco Plus":{normal:15,campaign:25}, "Funffy":{normal:7,campaign:22},
  "GoHerb Official Store":{normal:10,campaign:20}, "iLady Haircare by CTG4u":{normal:15,campaign:22},
  "ISOKAE":{normal:11,campaign:19}, "Jeeroul":{normal:11,campaign:24}, "Jourish":{normal:7,campaign:22},
  "Kata Marine":{normal:13,campaign:20}, "LivAct":{normal:15,campaign:21}, "M+":{normal:14,campaign:21},
  "MasterNerv":{normal:13,campaign:18}, "MCS":{normal:9,campaign:20}, "MFormula":{normal:14,campaign:20},
  "Mizino":{normal:8,campaign:19}, "Mizino Premium":{normal:10,campaign:21}, "Moesie":{normal:9,campaign:18},
  "Ninoko":{normal:10,campaign:21}, "NomoQ":{normal:13,campaign:20}, "Recovit":{normal:15,campaign:20},
  "Scale Gem":{normal:16,campaign:21}, "Scale Story":{normal:17,campaign:21}, "SkinDae":{normal:12,campaign:22},
  "Supu":{normal:3,campaign:15}, "TGC":{normal:11,campaign:23}, "URO360":{normal:13,campaign:18},
  "YCT Herbal":{normal:11,campaign:21}, "Zeero":{normal:10,campaign:20},
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
  "SUPU • 食补":"Supu",
};

export function voucherPresetFor(storeName="") {
  const key = STORE_ALIASES[storeName] ?? storeName;
  const preset = STORE_VOUCHER_PRESETS[key];
  return preset ? {store:key,...preset,available:true} : {store:storeName||"Selected store",normal:0,campaign:0,available:false};
}
