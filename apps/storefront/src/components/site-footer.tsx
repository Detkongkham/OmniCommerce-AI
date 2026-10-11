export function SiteFooter({ storeName }: { storeName: string }) {
  return (
    <footer className="mt-12 border-t border-line bg-chrome">
      <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-ink-secondary">
        <p>{storeName}</p>
        <p className="mt-1">ຊຳລະດ້ວຍການໂອນເງິນ · ຄ່າຂົນສົ່ງຊຳລະຕອນຮັບສິນຄ້າ</p>
      </div>
    </footer>
  );
}
