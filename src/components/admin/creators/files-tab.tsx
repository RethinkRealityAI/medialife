import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ARTWORK_CATEGORIES,
  COLLATERAL_KINDS,
  type ArtworkCategory,
  type CollateralKind,
  type FileKind,
  type HubFile,
} from "@/lib/hub/model";

import { Panel, PanelTitle } from "../kit";
import { UploadButton } from "./files-kit";
import { FileGrid } from "./product-panels";
import type { CreatorDetail } from "./types";

const GROUPS: Array<{ kind: FileKind; title: string; sub: string }> = [
  {
    kind: "artwork",
    title: "Artwork from the creator",
    sub: "Logos, characters, references and guidelines they uploaded.",
  },
  { kind: "proof", title: "Design proofs", sub: "Every version sent for approval." },
  { kind: "mockup", title: "Mockups", sub: "Product renders and photos." },
  {
    kind: "collateral",
    title: "Launch collateral",
    sub: "Posters, social assets, QR artwork, video.",
  },
];

const CATEGORIES: Record<FileKind, Record<string, string>> = {
  artwork: ARTWORK_CATEGORIES,
  proof: { proof: "Proof" },
  mockup: { mockup: "Mockup" },
  collateral: COLLATERAL_KINDS,
};

const NONE = "__none";

export function FilesTab({ data }: { data: CreatorDetail }) {
  const [kind, setKind] = useState<FileKind>("collateral");
  const [category, setCategory] = useState("social");
  const [productId, setProductId] = useState(NONE);
  const products = new Map(data.products.map((p) => [p.id, p.name]));

  const caption = (f: HubFile) => {
    const cat =
      f.kind === "artwork"
        ? ARTWORK_CATEGORIES[f.category as ArtworkCategory]
        : f.kind === "collateral"
          ? COLLATERAL_KINDS[f.category as CollateralKind]
          : null;
    const prod = f.productId ? products.get(f.productId) : null;
    return [cat, prod].filter(Boolean).join(" · ") || null;
  };

  return (
    <div className="@container/files space-y-4">
      <Panel className="p-4 sm:p-5">
        <PanelTitle
          title="Upload on behalf"
          sub="Files you add here appear in the creator's hub."
        />
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Select
            value={kind}
            onValueChange={(v) => {
              const k = v as FileKind;
              setKind(k);
              setCategory(Object.keys(CATEGORIES[k])[0]);
            }}
          >
            <SelectTrigger className="w-44" aria-label="File type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="artwork">Artwork (for the creator)</SelectItem>
              <SelectItem value="proof">Proof (not sent)</SelectItem>
              <SelectItem value="mockup">Mockup</SelectItem>
              <SelectItem value="collateral">Collateral</SelectItem>
            </SelectContent>
          </Select>
          {Object.keys(CATEGORIES[kind]).length > 1 ? (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIES[kind]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-52" aria-label="Product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No product (general)</SelectItem>
              {data.products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <UploadButton
            creatorId={data.creator.id}
            kind={kind}
            category={category}
            productId={productId === NONE ? null : productId}
            multiple
            variant="default"
            label="Choose files"
          />
        </div>
        {kind === "proof" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            To send a proof for approval, use the product's Design proofs panel.
          </p>
        ) : null}
      </Panel>

      {GROUPS.map((g) => {
        const files = data.files.filter((f) => f.kind === g.kind);
        return (
          <Panel key={g.kind} className="p-4 sm:p-5">
            <PanelTitle title={`${g.title} (${files.length})`} sub={g.sub} />
            <FileGrid files={files} empty="None yet." caption={caption} />
          </Panel>
        );
      })}
    </div>
  );
}
