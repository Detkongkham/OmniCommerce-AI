import { useEffect, useState } from "react";

/** ຄືນ `value` ຫຼັງຄ່ານັ້ນນິ່ງຢູ່ `delayMs` ມິລິວິນາທີ (ໃຊ້ກັບ input ຄົ້ນຫາ ເພື່ອບໍ່ຍິງ API ທຸກຕົວອັກສອນ). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
