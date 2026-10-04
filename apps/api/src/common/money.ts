interface DecimalLike {
  toFixed(decimalPlaces: number): string;
}

/** Prisma Decimal -> "12500.00" */
export const money = (value: DecimalLike): string => value.toFixed(2);

export const moneyOrNull = (value: DecimalLike | null): string | null => (value === null ? null : money(value));
