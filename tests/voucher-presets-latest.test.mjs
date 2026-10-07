import assert from "node:assert/strict";
import { test } from "node:test";
import { VOUCHER_PRESET_SOURCE, voucherPresetFor } from "../app/voucher-presets.js";

// CTG4u's campaign cell is blank in Final; preserve its prior confirmed 20% preset.
const expected = [
  {
    "store": "AgePros By Swissmed",
    "normal": 7,
    "campaign": 19
  },
  {
    "store": "Beyoute Official Store",
    "normal": 11,
    "campaign": 22
  },
  {
    "store": "BioTech by Swissmed",
    "normal": 18,
    "campaign": 19
  },
  {
    "store": "Naturelish Bugucare by CTG4u",
    "normal": 15,
    "campaign": 22
  },
  {
    "store": "CTG4u Malaysia",
    "normal": 19,
    "campaign": 20
  },
  {
    "store": "Dr Smile Whitening by CTG4u",
    "normal": 6,
    "campaign": 18
  },
  {
    "store": "Naturelish Eco Plus by CTG4u",
    "normal": 15,
    "campaign": 25
  },
  {
    "store": "iLady Haircare by CTG4u",
    "normal": 15,
    "campaign": 22
  },
  {
    "store": "Jourish Natural Wellness",
    "normal": 7,
    "campaign": 22
  },
  {
    "store": "Kata Skincare Malaysia",
    "normal": 13,
    "campaign": 20
  },
  {
    "store": "LivAct Official Store",
    "normal": 15,
    "campaign": 21
  },
  {
    "store": "M+ SkinPro by CTG4u",
    "normal": 14,
    "campaign": 21
  },
  {
    "store": "Master Nerv Official Store",
    "normal": 13,
    "campaign": 18
  },
  {
    "store": "MCS Skincare by CTG4u",
    "normal": 9,
    "campaign": 20
  },
  {
    "store": "MFormula Official",
    "normal": 14,
    "campaign": 20
  },
  {
    "store": "Mizino Premium",
    "normal": 10,
    "campaign": 21
  },
  {
    "store": "Mizino Official Store",
    "normal": 8,
    "campaign": 19
  },
  {
    "store": "Moesie",
    "normal": 9,
    "campaign": 18
  },
  {
    "store": "NatureLish Recovit by CTG4u",
    "normal": 15,
    "campaign": 20
  },
  {
    "store": "NINOKO Official Store",
    "normal": 10,
    "campaign": 21
  },
  {
    "store": "NomoQ by CTG4u",
    "normal": 13,
    "campaign": 20
  },
  {
    "store": "Scale Gem Collagen by CTG4u",
    "normal": 16,
    "campaign": 21
  },
  {
    "store": "Scale Story Official Store",
    "normal": 17,
    "campaign": 21
  },
  {
    "store": "SkinDae MY by CTG4u",
    "normal": 12,
    "campaign": 22
  },
  {
    "store": "Zeero Skincare Official",
    "normal": 10,
    "campaign": 20
  },
  {
    "store": "Yuan Chuan Tang Herbal by CTG4u",
    "normal": 11,
    "campaign": 21
  },
  {
    "store": "Naturelish Uro360 by CTG4u",
    "normal": 13,
    "campaign": 18
  },
  {
    "store": "Naturelish Isokae by CTG4u",
    "normal": 11,
    "campaign": 19
  },
  {
    "store": "Jeeroul by CTG4u",
    "normal": 11,
    "campaign": 24
  },
  {
    "store": "Funffy by CTG4u",
    "normal": 7,
    "campaign": 22
  },
  {
    "store": "True Golden Care by Naturelish",
    "normal": 11,
    "campaign": 23
  },
  {
    "store": "SUPU • 食补",
    "normal": 3,
    "campaign": 15
  },
  {
    "store": "GoHerb Official Store",
    "normal": 10,
    "campaign": 20
  },
  {
    "store": "Berlanco Beauty Official",
    "normal": 16,
    "campaign": 22
  }
];

test("customer voucher presets match the Final sheet snapshot from 7 October 2026", () => {
  assert.equal(VOUCHER_PRESET_SOURCE.updated, "2026-10-07");
  assert.equal(expected.length, 34);
  for (const row of expected) {
    const preset = voucherPresetFor(row.store);
    assert.equal(preset.available, true, row.store);
    assert.equal(preset.normal, row.normal, row.store);
    assert.equal(preset.campaign, row.campaign, row.store);
  }
});
