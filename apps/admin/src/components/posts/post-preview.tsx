"use client";

import { Card, cn } from "@oca/ui";
import { Globe } from "lucide-react";
import { useT } from "@/lib/i18n/language-provider";
import type { MediaDraft } from "@/lib/post-form";
import { mediaSrc } from "@/lib/posts";

/** ສະແດງ 4 ຮູບທຳອິດແບບ Facebook; ເກີນ = "+N" ໃນຮູບສຸດທ້າຍ */
const GRID_MAX = 4;

/** ຕົວຢ່າງໂພສແບບ Facebook (ປະມານ; ການຕັດຮູບຈິງເປັນຂອງ Facebook) */
export function PostPreview({ message, media }: { message: string; media: MediaDraft[] }) {
  const { t } = useT();
  const shown = media.slice(0, GRID_MAX);
  const extra = media.length - shown.length;
  const name = t("posts.preview.page");
  return (
    <Card className="overflow-hidden rounded-[20px]" aria-label={t("posts.preview.title")}>
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">{name}</p>
          <p className="flex items-center gap-1 text-xs text-ink-muted">
            {t("posts.preview.now")} · <Globe className="size-3" aria-hidden="true" />
          </p>
        </div>
      </div>
      {message.trim() ? <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm text-ink">{message.trim()}</p> : <div className="h-3" />}
      {shown.length > 0 ? (
        <div className={cn("grid gap-0.5", shown.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {shown.map((item, index) => (
            <div key={item.key} className={cn("relative bg-subtle", shown.length === 3 && index === 0 && "col-span-2")}>
              <img src={mediaSrc(item.url)} alt="" className={cn("w-full object-cover", shown.length === 1 ? "max-h-96" : "aspect-square")} />
              {extra > 0 && index === shown.length - 1 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-bold text-white">
                  {t("posts.preview.more", { count: extra })}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
