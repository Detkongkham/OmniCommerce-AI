"use client";

import { MEDIA_MIME_TYPES, POST_MEDIA_MAX } from "@oca/shared";
import { Button, Field, Input, toast } from "@oca/ui";
import { ArrowLeft, ArrowRight, ImageOff, Link2, Loader2, Package, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/language-provider";
import { type MediaDraft, mediaDraft } from "@/lib/post-form";
import { mediaSrc } from "@/lib/posts";
import { useUploadMedia } from "@/lib/queries-posts";
import { ProductImagePicker } from "./product-image-picker";

export interface PostMediaEditorProps {
  media: MediaDraft[];
  onChange: (update: (current: MediaDraft[]) => MediaDraft[]) => void;
  /** ຈຳນວນໄຟລ໌ທີ່ກຳລັງອັບໂຫຼດ (ຟອມລໍກ່ອນບັນທຶກ) */
  onUploadingChange: (count: number) => void;
  disabled?: boolean;
}

const isHttps = (value: string) => /^https:\/\/\S+$/.test(value) && value.length <= 2000;

export function PostMediaEditor({ media, onChange, onUploadingChange, disabled = false }: PostMediaEditorProps) {
  const { t } = useT();
  const upload = useUploadMedia();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const remaining = POST_MEDIA_MAX - media.length - uploading;

  const append = (items: MediaDraft[]) => onChange((current) => [...current, ...items].slice(0, POST_MEDIA_MAX));
  const setPending = (delta: number) =>
    setUploading((count) => {
      const next = count + delta;
      onUploadingChange(next);
      return next;
    });

  async function uploadFiles(files: File[]) {
    const accepted = files.slice(0, Math.max(0, remaining));
    setPending(accepted.length);
    // ທີລະໄຟລ໌ ຕາມລຳດັບທີ່ເລືອກ (ລຳດັບຮູບໃນໂພສ)
    for (const file of accepted) {
      try {
        const saved = await upload.mutateAsync(file);
        append([mediaDraft({ mediaFileId: saved.id, url: saved.path })]);
      } catch (error) {
        toast.error(t("posts.images.uploadFailed", { name: file.name, message: errorMessage(error, t) }));
      } finally {
        setPending(-1);
      }
    }
  }

  function addUrl() {
    const value = url.trim();
    if (!isHttps(value)) {
      setUrlError(t("posts.images.urlInvalid"));
      return;
    }
    append([mediaDraft({ mediaFileId: null, url: value })]);
    setUrl("");
    setUrlError(null);
    setUrlOpen(false);
  }

  const move = (index: number, delta: -1 | 1) =>
    onChange((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + delta, 0, item);
      return next;
    });

  return (
    <div className="space-y-4">
      {media.length === 0 && uploading === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ImageOff className="size-4" aria-hidden="true" />
          {t("posts.images.empty")}
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {media.map((item, index) => {
          const n = index + 1;
          return (
            <li key={item.key} data-testid={`post-image-${index}`} className="overflow-hidden rounded-xl border border-line">
              <img src={mediaSrc(item.url)} alt={t("posts.images.alt", { n })} className="aspect-square w-full bg-subtle object-cover" />
              {disabled ? null : (
                <div className="flex justify-between gap-1 p-1">
                  <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" aria-label={t("posts.images.up", { n })} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowLeft aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg"
                    aria-label={t("posts.images.down", { n })}
                    disabled={index === media.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-danger"
                    aria-label={t("posts.images.remove", { n })}
                    onClick={() => onChange((current) => current.filter((entry) => entry.key !== item.key))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
        {Array.from({ length: uploading }, (_, index) => (
          <li key={`uploading-${index}`} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-line bg-subtle">
            <Loader2 className="size-5 animate-spin text-ink-muted" aria-hidden="true" />
          </li>
        ))}
      </ul>
      {uploading > 0 ? (
        <p role="status" className="text-xs text-ink-muted">
          {t("posts.images.uploading", { count: uploading })}
        </p>
      ) : null}

      {disabled ? null : remaining <= 0 ? (
        <p className="text-xs text-ink-muted">{t("posts.images.full", { max: POST_MEDIA_MAX })}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outlinePrimary" className="rounded-lg" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden="true" />
              {t("posts.images.upload")}
            </Button>
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setPickerOpen(true)}>
              <Package aria-hidden="true" />
              {t("posts.images.fromProduct")}
            </Button>
            <Button type="button" variant="outline" className="rounded-lg" aria-expanded={urlOpen} onClick={() => setUrlOpen((open) => !open)}>
              <Link2 aria-hidden="true" />
              {t("posts.images.addUrl")}
            </Button>
          </div>
          <p className="text-xs text-ink-muted">{t("posts.images.uploadHint")}</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={MEDIA_MIME_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label={t("posts.images.upload")}
            data-testid="post-image-input"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) void uploadFiles(files);
            }}
          />
          {urlOpen ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t("posts.images.url")} htmlFor="post-image-url" error={urlError ?? undefined} className="min-w-[240px] flex-1">
                <Input
                  id="post-image-url"
                  placeholder="https://"
                  value={url}
                  aria-invalid={urlError ? true : undefined}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addUrl();
                    }
                  }}
                />
              </Field>
              <Button type="button" className="rounded-lg" onClick={addUrl}>
                {t("posts.images.addButton")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <ProductImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        remaining={Math.max(0, remaining)}
        onPick={(urls) => append(urls.map((value) => mediaDraft({ mediaFileId: null, url: value })))}
      />
    </div>
  );
}
