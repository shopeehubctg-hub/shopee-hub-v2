export type CalculatorSnapshot = {
  source:"Shopee Pricing Calculator";
  packageName:string;
  category:string;
  cashbackProgramme:boolean;
  customCommission:number|null;
  commissionRate:number;
  transactionRate:number;
  serviceScenario:"Non-Campaign Day"|"Campaign Day";
  serviceRate:number;
  serviceCap:number;
  preorderListing:boolean;
  preorderRate:number;
  platformSupportFee:number;
  shopeeVoucherRate:number;
  sellerVoucher:number;
  cofundVoucher:number;
  sellerShipping:number;
  facebookShipping:number;
  extraProfit:number;
  facebookPrice:number;
  suggestedShopeePrice:number;
  customerVoucherPrice:number;
  markupRate:number;
  markupAmount:number;
  markupCustomized?:boolean;
  systemSuggestedMarkupRate?:number;
  systemSuggestedShopeePrice?:number;
  targetPayout:number;
  actualPayout:number;
};

export type PackagePrefill = {
  requestId:number;
  name:string;
  sellingPrice:number;
  calculatorSettings:CalculatorSnapshot;
};
