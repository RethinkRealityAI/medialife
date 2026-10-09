import { Megaphone, Package, Palette, UserRound, type LucideIcon } from "lucide-react";

// The shelf editor's four settings sections, and where a config path lives.

export type ShelfSectionId = "creator" | "theme" | "products" | "pitch";

export const SHELF_SECTIONS: { id: ShelfSectionId; label: string; icon: LucideIcon }[] = [
  { id: "creator", label: "Creator", icon: UserRound },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "products", label: "Products", icon: Package },
  { id: "pitch", label: "Pitch", icon: Megaphone },
];

export const sectionOfPath = (path: string): ShelfSectionId =>
  path.startsWith("products")
    ? "products"
    : path.startsWith("theme")
      ? "theme"
      : path.startsWith("pitch")
        ? "pitch"
        : "creator";

/** DOM id of the field for a config path ("products.2.name" → "shelf-products-2-name"). */
export const shelfFieldId = (path: string) => `shelf-${path.replace(/\./g, "-")}`;
