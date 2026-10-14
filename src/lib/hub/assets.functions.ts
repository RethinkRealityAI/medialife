import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  ASSET_LIMITS,
  ASSET_SECTIONS,
  applyAssetPatch,
  cleanTag,
  inLibrary,
  normaliseTags,
  tagKey,
  tagsOf,
} from "./assets";
import {
  deleteFolder,
  getCreator,
  getFile,
  getFolder,
  listFiles,
  listFolders,
  saveFile,
  saveFolder,
} from "./data.server";
import type { AssetFolder, HubFile } from "./model";
import { isLibraryOwner } from "./partners";
import { HubAuthError, requireCreator, requireHubAdmin } from "./session.server";
import { newId, type HubNamespace } from "./store.server";

// The asset library: organise files (section, folder, tags, star, name, note)
// and manage folders. Uploading and deleting files stay on /api/hub/files.
//
// The same functions serve the creator (no creatorId: their own library) and
// the team (creatorId set: requires the /admin cookie). Organising is open to
// everything in the library; renaming a file and its note belong to whoever
// uploaded it, plus the team.

const id = z.string().regex(/^[A-Za-z0-9]{6,60}$/);
const tag = z.string().max(ASSET_LIMITS.tagLength * 2);
const folderName = z.string().trim().min(1).max(ASSET_LIMITS.folderName);

type Who = { ns: HubNamespace; creatorId: string; admin: boolean };

async function who(creatorId?: string): Promise<Who> {
  if (creatorId) {
    const ns = await requireHubAdmin();
    // The MEDIALIFE kit and partner libraries have no creator record.
    if (!isLibraryOwner(creatorId) && !(await getCreator(ns, creatorId)))
      throw new HubAuthError("no-creator");
    return { ns, creatorId, admin: true };
  }
  const { ns, creator } = await requireCreator();
  return { ns, creatorId: creator.id, admin: false };
}

const mayEdit = (w: Who, f: HubFile) => w.admin || f.uploadedBy === "creator";

/* ---------------------------------------------------------------------------
   Files
   --------------------------------------------------------------------------- */

const updateSchema = z.object({
  creatorId: id.optional(),
  ids: z.array(id).min(1).max(500),
  section: z.enum(ASSET_SECTIONS).optional(),
  /** A folder id, or null for loose in the section. */
  folderId: id.nullable().optional(),
  setTags: z
    .array(tag)
    .max(ASSET_LIMITS.tagsPerFile * 2)
    .optional(),
  addTags: z.array(tag).max(ASSET_LIMITS.tagsPerFile).optional(),
  removeTags: z
    .array(tag)
    .max(ASSET_LIMITS.tagsPerFile * 2)
    .optional(),
  starred: z.boolean().optional(),
  name: z.string().trim().min(1).max(140).optional(),
  note: z.string().max(500).optional(),
});

export type AssetUpdate = z.infer<typeof updateSchema>;

/** One change applied to one or many files. Returns the files as saved. */
export const updateAssets = createServerFn({ method: "POST" })
  .validator(updateSchema)
  .handler(async ({ data }) => {
    const w = await who(data.creatorId);
    if ((data.name !== undefined || data.note !== undefined) && data.ids.length !== 1)
      throw new Error("Rename one file at a time.");

    const folder = data.folderId ? await getFolder(w.ns, w.creatorId, data.folderId) : null;
    if (data.folderId && !folder) throw new Error("That folder no longer exists.");

    const files = (
      await Promise.all(data.ids.map((fid) => getFile(w.ns, w.creatorId, fid)))
    ).filter((f): f is HubFile => !!f && inLibrary(f));

    const { section, folderId, setTags, addTags, removeTags, starred, name, note } = data;
    const patch = { section, folderId, setTags, addTags, removeTags, starred, name, note };
    const saved: HubFile[] = [];
    for (const f of files) {
      if ((patch.name !== undefined || patch.note !== undefined) && !mayEdit(w, f))
        throw new Error("Only whoever uploaded a file can rename it or change its note.");
      saved.push(await saveFile(w.ns, applyAssetPatch(f, patch, folder)));
    }
    return { files: saved };
  });

/** Rename a tag on every file (to: a new name), or remove it everywhere (to: null). */
export const renameTag = createServerFn({ method: "POST" })
  .validator(z.object({ creatorId: id.optional(), from: tag, to: tag.nullable() }))
  .handler(async ({ data }) => {
    const w = await who(data.creatorId);
    const from = tagKey(data.from);
    const to = data.to === null ? null : cleanTag(data.to);
    if (!from || to === "") throw new Error("Give the tag a name.");
    let changed = 0;
    for (const f of (await listFiles(w.ns, w.creatorId)).filter(inLibrary)) {
      const tags = tagsOf(f);
      if (!tags.some((t) => tagKey(t) === from)) continue;
      await saveFile(w.ns, {
        ...f,
        tags: normaliseTags(tags.flatMap((t) => (tagKey(t) === from ? (to ? [to] : []) : [t]))),
      });
      changed++;
    }
    return { changed };
  });

/* ---------------------------------------------------------------------------
   Folders
   --------------------------------------------------------------------------- */

async function uniqueName(w: Who, section: string, name: string, except?: string) {
  const taken = (await listFolders(w.ns, w.creatorId)).filter(
    (f) => f.section === section && f.id !== except,
  );
  if (taken.some((f) => f.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`There's already a folder called “${name}” here.`);
  return taken.length;
}

export const createFolder = createServerFn({ method: "POST" })
  .validator(
    z.object({ creatorId: id.optional(), name: folderName, section: z.enum(ASSET_SECTIONS) }),
  )
  .handler(async ({ data }) => {
    const w = await who(data.creatorId);
    const all = await listFolders(w.ns, w.creatorId);
    if (all.length >= ASSET_LIMITS.foldersPerCreator)
      throw new Error("That's the most folders a library can have. Tidy a few up first.");
    await uniqueName(w, data.section, data.name);
    const folder: AssetFolder = {
      id: newId(10),
      creatorId: w.creatorId,
      name: data.name,
      section: data.section,
      createdAt: Date.now(),
      createdBy: w.admin ? "medialife" : "creator",
    };
    return { folder: await saveFolder(w.ns, folder) };
  });

export const renameFolder = createServerFn({ method: "POST" })
  .validator(z.object({ creatorId: id.optional(), id, name: folderName }))
  .handler(async ({ data }) => {
    const w = await who(data.creatorId);
    const folder = await getFolder(w.ns, w.creatorId, data.id);
    if (!folder) throw new Error("That folder no longer exists.");
    await uniqueName(w, folder.section, data.name, folder.id);
    return { folder: await saveFolder(w.ns, { ...folder, name: data.name }) };
  });

/** Deletes the folder only: its files stay, loose in the section. */
export const removeFolder = createServerFn({ method: "POST" })
  .validator(z.object({ creatorId: id.optional(), id }))
  .handler(async ({ data }) => {
    const w = await who(data.creatorId);
    const folder = await getFolder(w.ns, w.creatorId, data.id);
    if (!folder) return { moved: 0 };
    let moved = 0;
    for (const f of await listFiles(w.ns, w.creatorId)) {
      if (f.folderId !== folder.id) continue;
      await saveFile(w.ns, { ...f, folderId: null, section: folder.section });
      moved++;
    }
    await deleteFolder(w.ns, folder);
    return { moved };
  });
