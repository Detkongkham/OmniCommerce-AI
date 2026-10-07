import { Decimal } from "decimal.js";

// Decimal ສະເພາະຂອງໂມດູນນີ້: ປັດເສດ half-up ໂດຍບໍ່ແຕະ config ທົ່ວໂລກ
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface TotalsLineInput {
  unitPrice: string;
  quantity: number;
  discount: string;
}

export interface OrderTotalsInput {
  lines: TotalsLineInput[];
  shippingFee: string;
  vatRate: string;
  pricesIncludeVat: boolean;
}

export interface OrderTotals {
  lines: { lineTotal: string }[];
  subtotal: string;
  discountTotal: string;
  vatAmount: string;
  total: string;
}

const money = (value: Decimal): string => value.toDecimalPlaces(2).toFixed(2);

/**
 * ສູດຕາມ spec §7.2:
 *   lineTotal = unitPrice x quantity - discount (ຕ້ອງ >= 0)
 *   subtotal = sum(lineTotal) (ຫຼັງຫັກສ່ວນຫຼຸດລາຍການ); vatBase = subtotal + shippingFee
 *   ລວມ VAT: vat = vatBase x r / (100 + r), total = vatBase
 *   ບໍ່ລວມ VAT: vat = vatBase x r / 100, total = vatBase + vat
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const lines = input.lines.map((line) => {
    const lineTotal = new D(line.unitPrice).mul(line.quantity).minus(line.discount);
    if (lineTotal.isNegative()) {
      throw new RangeError("discount exceeds line amount");
    }
    return { lineTotal, discount: new D(line.discount) };
  });

  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new D(0));
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discount), new D(0));
  const vatBase = subtotal.plus(input.shippingFee);
  const rate = new D(input.vatRate);

  const vatAmount = input.pricesIncludeVat
    ? vatBase.mul(rate).div(rate.plus(100)).toDecimalPlaces(2)
    : vatBase.mul(rate).div(100).toDecimalPlaces(2);
  const total = input.pricesIncludeVat ? vatBase : vatBase.plus(vatAmount);

  return {
    lines: lines.map((line) => ({ lineTotal: money(line.lineTotal) })),
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    vatAmount: money(vatAmount),
    total: money(total),
  };
}
