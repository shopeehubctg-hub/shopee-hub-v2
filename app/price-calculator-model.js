export const COMMISSION_CATEGORIES = [
  { cluster:"Electronics", name:"Audio — standard", cashback:7.5, noCashback:12.5 },
  { cluster:"Electronics", name:"Audio cables, converters & others", cashback:10, noCashback:15 },
  { cluster:"Electronics", name:"Cameras, drones & lenses", cashback:6, noCashback:11 },
  { cluster:"Electronics", name:"Camera & drone accessories", cashback:10, noCashback:15 },
  { cluster:"Electronics", name:"Computers — components & storage", cashback:6.5, noCashback:11.5 },
  { cluster:"Electronics", name:"Computers — laptops & monitors", cashback:8, noCashback:13 },
  { cluster:"Electronics", name:"Computers — peripherals & accessories", cashback:10, noCashback:15 },
  { cluster:"Electronics", name:"Gaming — consoles & games", cashback:7, noCashback:12 },
  { cluster:"Electronics", name:"Gaming — accessories", cashback:9, noCashback:14 },
  { cluster:"Electronics", name:"Home appliances", cashback:8, noCashback:13 },
  { cluster:"Electronics", name:"Mobile phones, tablets & wearables", cashback:6, noCashback:11 },
  { cluster:"Electronics", name:"Mobile accessories & SIM cards", cashback:9, noCashback:14 },
  { cluster:"Fashion", name:"Baby & kids fashion", cashback:10, noCashback:15 },
  { cluster:"Fashion", name:"Fashion accessories", cashback:10, noCashback:15 },
  { cluster:"Fashion", name:"Fine jewellery", cashback:10, noCashback:15 },
  { cluster:"Fashion", name:"Men & women clothes", cashback:9, noCashback:14 },
  { cluster:"Fashion", name:"Men & women shoes", cashback:10, noCashback:15 },
  { cluster:"Fashion", name:"Muslim fashion", cashback:9, noCashback:14 },
  { cluster:"Fashion", name:"Travel & luggage", cashback:9, noCashback:14 },
  { cluster:"Fashion", name:"Watches", cashback:10, noCashback:15 },
  { cluster:"Fashion", name:"Men & women bags", cashback:9.5, noCashback:14.5 },
  { cluster:"Lifestyle", name:"Automobiles & accessories", cashback:9.5, noCashback:14.5 },
  { cluster:"Lifestyle", name:"Books & magazines", cashback:10, noCashback:15 },
  { cluster:"Lifestyle", name:"Hobbies & collections", cashback:11, noCashback:16 },
  { cluster:"Lifestyle", name:"Home & living", cashback:10.5, noCashback:15.5 },
  { cluster:"Lifestyle", name:"Motorcycles & accessories", cashback:9.5, noCashback:14.5 },
  { cluster:"Lifestyle", name:"Sports & outdoors", cashback:10, noCashback:15 },
  { cluster:"Lifestyle", name:"Stationery", cashback:10, noCashback:15 },
  { cluster:"FMCG", name:"Beauty", cashback:12, noCashback:17 },
  { cluster:"FMCG", name:"Health", cashback:12, noCashback:17 },
  { cluster:"FMCG", name:"Mom & baby — feeding essentials", cashback:8, noCashback:13 },
  { cluster:"FMCG", name:"Mom & baby — general", cashback:10, noCashback:15 },
  { cluster:"FMCG", name:"Pets", cashback:10, noCashback:15 },
  { cluster:"Food & Beverages", name:"Bakery", cashback:4, noCashback:9 },
  { cluster:"Food & Beverages", name:"Alcoholic beverages", cashback:9, noCashback:14 },
];

export const SERVICE_MODES = {
  none:{ label:"No campaign service fee", rate:0 },
  nonCampaign:{ label:"Non-Campaign Day", rate:5.94 },
  campaign:{ label:"Campaign Day", rate:8.1 },
};

export function commissionRateFor(categoryIndex, onCashback, customRate = 0) {
  if (categoryIndex === "custom") return Math.max(0, customRate);
  const category = COMMISSION_CATEGORIES[Number(categoryIndex)] ?? COMMISSION_CATEGORIES[0];
  const baseRate = onCashback ? category.cashback : category.noCashback;
  return baseRate * 1.08;
}

export function calculateFeesForPrice(price, fees) {
  const feeBase = Math.max(0, price - fees.sellerVoucher - fees.cofundVoucher);
  const transactionFee = feeBase * fees.transaction / 100;
  const commissionFee = feeBase * fees.commission / 100;
  const uncappedServiceFee = feeBase * fees.service / 100;
  const serviceFee = Math.min(uncappedServiceFee, fees.serviceCap);
  const preorderFee = fees.isPreorder ? feeBase * fees.preorder / 100 : 0;
  const payout = price - fees.sellerVoucher - fees.cofundVoucher / 2 -
    transactionFee - commissionFee - serviceFee - preorderFee -
    fees.platformSupport - fees.sellerShipping;
  return { feeBase, transactionFee, commissionFee, serviceFee, uncappedServiceFee, preorderFee, payout };
}

export function calculateShopeePrice(row, fees) {
  const uncappedRate = (fees.transaction + fees.commission + (fees.isPreorder ? fees.preorder : 0)) / 100;
  const valid = uncappedRate >= 0 && uncappedRate < 1 && fees.service >= 0;
  const targetPayout = Math.max(0, row.facebookPrice - fees.facebookShipping + fees.extraProfit);
  let low = 0;
  let high = Math.max(100, targetPayout * 2 + fees.serviceCap + fees.cofundVoucher + fees.sellerVoucher);
  if (valid) {
    while (calculateFeesForPrice(high, fees).payout < targetPayout && high < 1_000_000) high *= 2;
    for (let index=0; index<80; index++) {
      const middle = (low + high) / 2;
      if (calculateFeesForPrice(middle, fees).payout < targetPayout) low = middle;
      else high = middle;
    }
  } else {
    high = 0;
  }
  const requiredPrice = high;
  const calculated = calculateFeesForPrice(requiredPrice, fees);
  const customerPrice = calculated.feeBase * (1 - Math.min(100, fees.shopeeVoucher) / 100);
  const markupAmount = requiredPrice - row.facebookPrice;
  const markupRate = row.facebookPrice ? markupAmount / row.facebookPrice * 100 : 0;
  return {
    valid, targetPayout, requiredPrice, customerPrice, markupAmount, markupRate,
    ...calculated, serviceCapped:calculated.uncappedServiceFee > fees.serviceCap,
  };
}
