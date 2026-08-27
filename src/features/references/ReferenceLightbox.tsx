import { useEffect, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { ipc } from "@/lib/ipc";
import { useProject } from "@/stores/projectStore";
import { useUi } from "@/stores/uiStore";

/**
 * Full-resolution files never enter the webview: the backend renders a bounded
 * preview on demand and hands back a data URL.
 */
export function ReferenceLightbox() {
  const id = useUi((s) => s.lightboxReferenceId);
  const setUi = useUi((s) => s.set);
  const references = useProject((s) => s.project.references);
  const [preview, setPreview] = useState<string | null>(null);

  const reference = references.find((r) => r.id === id);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (!reference || reference.kind !== "image") return;

    void ipc
      .mediaPreview(reference.path, 1800)
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview(reference.thumbnail ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [reference]);

  if (!reference) return null;

  return (
    <Lightbox
      open
      close={() => setUi("lightboxReferenceId", null)}
      plugins={[Zoom]}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true }}
      slides={[{ src: preview ?? reference.thumbnail ?? "", alt: reference.fileName }]}
      render={{ buttonPrev: () => null, buttonNext: () => null }}
      styles={{ container: { backgroundColor: "rgba(5,6,8,0.94)" } }}
    />
  );
}
