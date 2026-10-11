import { describe, expect, it } from "vitest";
import { isInternalHostname } from "./ssrf-guard";

describe("isInternalHostname", () => {
  it("ບລັອກຊື່ພາຍໃນ ແລະ hostname ປ່ອນດຽວ (ບໍ່ມີຈຸດ)", () => {
    for (const host of ["localhost", "LOCALHOST.", "api.localhost", "printer.local", "db.internal", "metadata", "intranet"]) {
      expect(isInternalHostname(host), host).toBe(true);
    }
  });

  it("ບລັອກ IPv4 ພາຍໃນ/ສະຫງວນ ລວມ documentation, benchmark, IETF", () => {
    for (const host of [
      "127.0.0.1", "127.1", "2130706433", "0x7f000001", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.31.255.255",
      "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.0.8", "192.0.2.1", "198.18.0.1", "198.19.255.1",
      "198.51.100.7", "203.0.113.9", "224.0.0.1", "255.255.255.255",
    ]) {
      expect(isInternalHostname(host), host).toBe(true);
    }
  });

  it("ບລັອກ IPv6 ພາຍໃນ ແລະ ຮູບທີ່ຝັງ IPv4", () => {
    for (const host of [
      "[::1]", "[::]", "[fe80::1]", "[fc00::1]", "[fd12:3456::1]", "[fec0::1]", "[feff::1]",
      "[::ffff:127.0.0.1]", "[::ffff:10.0.0.1]", "[::127.0.0.1]",
      "[::ffff:0:127.0.0.1]", "[::ffff:0:a00:1]",
      "[2002:7f00:1::1]", "[2002:a9fe:a9fe::]", "[2002:c0a8:101::1]",
      "[64:ff9b::7f00:1]", "[64:ff9b::169.254.169.254]", "[64:ff9b::a00:1]",
      "[1:2:3:4:5:6:7:8:9]",
    ]) {
      expect(isInternalHostname(host), host).toBe(true);
    }
  });

  it("ອະນຸຍາດ host ສາທາລະນະ", () => {
    for (const host of [
      "cdn.example", "localhost.example.com", "8.8.8.8", "172.32.0.1", "172.15.0.1", "198.20.0.1", "192.0.3.1", "100.128.0.1",
      "[2606:4700::1111]", "[64:ff9b::808:808]", "[::ffff:8.8.8.8]",
    ]) {
      expect(isInternalHostname(host), host).toBe(false);
    }
  });
});
