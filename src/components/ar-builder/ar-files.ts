import type { Project } from "@/lib/ar/project";
import { assetUrl } from "@/lib/ar/projects";

import type { Engine } from "./use-engine";
import { uploadBlob } from "./upload";

/** Build the AR files in the preview and upload them. Shared with the publish flow. */
export async function buildAndUploadAR(
  engine: Engine,
  project: Project,
  onStep?: (label: string, fraction?: number) => void,
): Promise<{ glb: string; usdz: string; generatedAt: number }> {
  onStep?.("Building the 3D files in the preview");
  const files = await engine.exportAR(project.defaultTheme);
  const total = files.glb.byteLength + files.usdz.byteLength;
  onStep?.("Uploading the AR files", 0);
  const glb = await uploadBlob(
    new Blob([files.glb], { type: "model/gltf-binary" }),
    { name: `${project.slug}.glb`, kind: "model", mime: "model/gltf-binary", tags: ["ar"] },
    { onProgress: (f) => onStep?.("Uploading the AR files", (f * files.glb.byteLength) / total) },
  );
  const usdz = await uploadBlob(
    new Blob([files.usdz], { type: "model/vnd.usdz+zip" }),
    { name: `${project.slug}.usdz`, kind: "model", mime: "model/vnd.usdz+zip", tags: ["ar"] },
    {
      onProgress: (f) =>
        onStep?.(
          "Uploading the AR files",
          (files.glb.byteLength + f * files.usdz.byteLength) / total,
        ),
    },
  );
  return { glb: assetUrl(glb.id), usdz: assetUrl(usdz.id), generatedAt: Date.now() };
}
