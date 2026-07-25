/**
 * Reverse-solves the Shopee listing price required to preserve a target payout.
 * The fee basis and voucher treatment mirror the reference calculator.
 *
 * @param {{ facebookPrice:number }} row
 * @param {{
 * transaction:number, commission:number, service:number, platformSupport:number,
 * shopeeVoucher:number, sellerVoucher:number, cofundVoucher:number,
 * sellerShipping:number, facebookShipping:number, extraProfit:number
 * }} fees
 */
export function calculateShopeePrice(row, fees) {
  const rate = (fees.transaction + fees.commission + fees.service) / 100;
  const valid = rate >= 0 && rate < 1;
  const targetPayout = Math.max(0, row.facebookPrice - fees.facebookShipping + fees.extraProfit);
  const requiredPrice = valid ? (
    targetPayout +
    fees.sellerVoucher * (1 - rate) -
    fees.cofundVoucher * (rate - 0.5) +
    fees.platformSupport +
    fees.sellerShipping
  ) / (1 - rate) : 0;
  const feeBase = Math.max(0, requiredPrice - fees.sellerVoucher - fees.cofundVoucher);
  const transactionFee = feeBase * fees.transaction / 100;
  const commissionFee = feeBase * fees.commission / 100;
  const serviceFee = feeBase * fees.service / 100;
  const payout = requiredPrice - fees.sellerVoucher - fees.cofundVoucher / 2 -
    transactionFee - commissionFee - serviceFee - fees.platformSupport - fees.sellerShipping;
  const customerPrice = feeBase * (1 - Math.min(100, fees.shopeeVoucher) / 100);
  const markupAmount = requiredPrice - row.facebookPrice;
  const markupRate = row.facebookPrice ? markupAmount / row.facebookPrice * 100 : 0;
  return {
    valid, rate, targetPayout, requiredPrice, customerPrice, payout, markupAmount,
    markupRate, feeBase, transactionFee, commissionFee, serviceFee,
  };
}
