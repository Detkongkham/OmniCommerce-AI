import { Card } from "@oca/ui";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app p-4">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
        <Image src="/oca-mark.png" alt="OmniCommerce AI" width={64} height={64} priority />
        <h1 className="text-2xl font-bold text-ink">OmniCommerce AI</h1>
        <p className="text-sm text-ink-secondary">ຮ້ານຄ້າອອນລາຍກຳລັງຈະມາໄວໆນີ້ · Storefront coming soon</p>
      </Card>
    </main>
  );
}
