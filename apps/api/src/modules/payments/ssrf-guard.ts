/** ແປງ IPv6 (ຮູບ normalized ຈາກ URL, ບໍ່ມີ []) ເປັນ 8 ກຸ່ມ; null ຖ້າອ່ານບໍ່ໄດ້ */
function parseIpv6(host: string): number[] | null {
  let text = host;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const parts = dotted[1].split(".").map(Number);
    if (parts.some((part) => part > 255)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = parts;
    text = `${text.slice(0, -dotted[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((group) =>
    /^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN,
  );
  return groups.length === 8 && groups.every((group) => !Number.isNaN(group)) ? groups : null;
}

function isInternalIpv4(a: number, b: number, c: number): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0.0/24 (IETF), 192.0.2.0/24 (TEST-NET-1)
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (benchmark)
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast + reserved + broadcast
  );
}

/** ກວດ IPv4 ທີ່ຝັງໃນ 2 ກຸ່ມສຸດທ້າຍຂອງ IPv6 */
function embeddedIpv4Internal(high: number, low: number): boolean {
  return isInternalIpv4(high >> 8, high & 0xff, low >> 8);
}

/**
 * Guard ແບບ literal-hostname ຕໍ່ SSRF (ໃຊ້ເມື່ອ allowHttp=false ຄື production):
 * ປະຕິເສດ localhost/*.localhost/*.local/*.internal, hostname ປ່ອນດຽວ (ບໍ່ມີຈຸດ ເຊັ່ນ "metadata"),
 * ແລະ IP literal ທີ່ເປັນ loopback/private/link-local/metadata/ສະຫງວນ ລວມ IPv6 ທີ່ຝັງ IPv4
 * (mapped, translated, NAT64 64:ff9b::/96) ແລະ 6to4 (2002::/16), fec0::/10.
 * URL ຂອງ WHATWG ປ່ຽນເລກຖານ 10/16/8 ເປັນ dotted quad ໃຫ້ແລ້ວ; ຖ້າເອີ້ນກົງດ້ວຍຮູບທີ່ບໍ່ມາດຕະຖານ ກໍບລັອກໄວ້ກ່ອນ.
 * ຂໍ້ຈຳກັດ: ບໍ່ກວດ DNS; hostname ທີ່ຊື່ສາທາລະນະແຕ່ resolve ເປັນ IP ພາຍໃນ (ແລະ DNS rebinding) ບໍ່ຖືກກັນ
 * ຕ້ອງກັນເພີ່ມໃນຊັ້ນເຄືອຂ່າຍ (egress firewall) ຖ້າຕ້ອງການ.
 */
export function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIpv6(host.slice(1, -1));
    if (!groups) return true; // ອ່ານບໍ່ໄດ້ = ບໍ່ໄວ້ໃຈ
    const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
    if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true; // fe80::/10, fec0::/10
    if (g0 === 0x2002) return true; // 6to4
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
      return embeddedIpv4Internal(g6, g7); // NAT64
    }
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0) {
      if (g4 === 0 && g5 === 0 && g6 === 0 && g7 <= 1) return true; // :: ແລະ ::1
      if (g4 === 0 && (g5 === 0xffff || g5 === 0)) return embeddedIpv4Internal(g6, g7); // ::ffff:a.b.c.d, ::a.b.c.d
      if (g4 === 0xffff && g5 === 0) return embeddedIpv4Internal(g6, g7); // ::ffff:0:a.b.c.d (translated)
    }
    return false;
  }
  if (!host.includes(".")) return true; // localhost, "metadata", "intranet", ເລກດ່ຽວ/hex
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) return isInternalIpv4(Number(v4[1]), Number(v4[2]), Number(v4[3]));
  // label ສຸດທ້າຍເປັນເລກ/hex ແຕ່ບໍ່ແມ່ນ dotted quad ມາດຕະຖານ (ເຊັ່ນ 127.1) = ຮູບ IPv4 ແບບເກົ່າ
  const last = host.slice(host.lastIndexOf(".") + 1);
  return /^(\d+|0x[0-9a-f]*)$/.test(last);
}
