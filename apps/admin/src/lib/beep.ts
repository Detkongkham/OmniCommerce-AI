/** ສຽງສັ້ນຕອນຍິງ (ຖືກ = ສູງສັ້ນ, ຜິດ = ຕ່ຳຍາວ) ຜ່ານ Web Audio; ບໍ່ມີໄຟລ໌ສຽງ. browser ບໍ່ຮອງຮັບ = ບໍ່ມີສຽງ */
let context: AudioContext | null = null;

export function beep(kind: "ok" | "error"): void {
  try {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    context ??= new AudioCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === "ok" ? 1200 : 220;
    oscillator.type = kind === "ok" ? "sine" : "square";
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(context.destination);
    const seconds = kind === "ok" ? 0.08 : 0.35;
    oscillator.start();
    oscillator.stop(context.currentTime + seconds);
  } catch {
    // ສຽງເປັນພຽງສິ່ງຊ່ວຍ: ລົ້ມກໍບໍ່ເປັນຫຍັງ
  }
}
