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

// Source: Final!A1:D36, read 4 Nov 2026. Historical customer-voucher averages,
// not guaranteed future entitlements. Existing saved Calculator snapshots are immutable.
export const PERIOD_VOUCHER_REFERENCE_DATE='2026-11-04';
const PERIOD_REFERENCES={
 'Agepros':[15.18,2.81,18.22], 'Beyoute':[19.55,4.35,22], 'Biotech':[10.01,7.09,22.23],
 'Bonlife Official Store':[11.70,6.01,19.86], 'CTG4u':[20.40,7,22], 'Dr Smile':[8.56,4.32,19.35],
 'Funffy':[17.14,8,22], 'GoHerb Official Store':[16.90,6.36,21.50], 'iLady Haircare by CTG4u':[17.63,9.86,22.04],
 'Jeeroul':[16.02,7,21.25], 'Jourish':[16.72,9.32,20.66], 'Kata Marine':[17.18,6.24,21.37],
 'LivAct':[15.98,4.78,19.33], 'M+':[18.80,7.76,19.35], 'MasterNerv':[16.85,8.47,20.60],
 'MCS':[17.13,6.22,18.92], 'MFormula':[17.88,7,22], 'Mizino':[14.94,11.95,20.36],
 'Mizino Premium':[15.36,7.88,20.61], 'Moesie':[16.56,6.31,20.61], 'Bugucare':[17.76,11.01,22.02],
 'Eco Plus':[22.18,15.27,21.94], 'ISOKAE':[16.40,11.80,21.91], 'Naturelish Humeal by CTG4u':[16.63,11.82,21.74],
 'Recovit':[18.60,7,22], 'URO360':[15.91,2.66,20.66], 'Ninoko':[11.83,6.45,19.39],
 'NomoQ':[16.40,9.34,22], 'Scale Gem':[21.74,2.95,20.48], 'Scale Story':[15.62,11.69,21.04],
 'SkinDae':[17.40,5,22], 'Supu':[5.55,0,17.89], 'TGC':[19.95,14,22.40],
 'YCT Herbal':[15.84,8.70,19.86], 'Zeero':[16.28,6.22,19.05],
};
export function periodVoucherPresetFor(storeName=''){
 const key=STORE_ALIASES[storeName]??storeName,values=PERIOD_REFERENCES[key];
 return {store:key,early:values?.[0]??null,late:values?.[1]??null,campaign:values?.[2]??null,available:!!values};
}
