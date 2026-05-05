import html2canvas from "html2canvas";

function toPngFilename(base) {
  const safe = String(base || "match-summary")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "match-summary"}.png`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportElementToPng(element, filenameBase) {
  if (!element) throw new Error("Nothing to export.");

  const canvas = await html2canvas(element, {
    backgroundColor: "#0b1020",
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to export PNG.");
  downloadBlob(toPngFilename(filenameBase), blob);
}

export async function renderElementToPngDataUrl(element) {
  if (!element) throw new Error("Nothing to export.");
  const canvas = await html2canvas(element, {
    backgroundColor: "#0b1020",
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
  });
  return canvas.toDataURL("image/png");
}

