function minSize(el, prop) {
  const computed = getComputedStyle(el);
  const value = prop === "height" ? computed.minHeight : computed.minWidth;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function initResizer(resizer, direction) {
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();

    const prev = resizer.previousElementSibling;
    const next = resizer.nextElementSibling;
    const prop = direction === "h" ? "height" : "width";
    const startPos = direction === "h" ? e.clientY : e.clientX;
    const startSizeA = prev.getBoundingClientRect()[prop];
    const startSizeB = next.getBoundingClientRect()[prop];

    const fixedSide = resizer.dataset.fixed === "prev" ? "prev" : "next";
    const fixed = fixedSide === "prev" ? prev : next;
    const flexible = fixedSide === "prev" ? next : prev;
    const fixedStart = fixedSide === "prev" ? startSizeA : startSizeB;

    fixed.style.flex = `0 0 ${fixedStart}px`;
    flexible.style.flex = "1 1 0";
    document.body.style.cursor =
      direction === "h" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";

    const fixedMin = minSize(fixed, prop);
    const flexMin = minSize(flexible, prop);
    const total = startSizeA + startSizeB;

    function onMove(e) {
      const delta =
        direction === "h" ? e.clientY - startPos : e.clientX - startPos;
      const signed = fixedSide === "prev" ? delta : -delta;
      const size = Math.max(
        fixedMin,
        Math.min(fixedStart + signed, total - flexMin),
      );
      fixed.style.flex = `0 0 ${size}px`;
    }

    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

export function initResizers() {
  const resizerH = document.querySelectorAll(".resizer-h");
  const resizerV = document.querySelectorAll(".resizer-v");
  resizerH.forEach((resizer) => initResizer(resizer, "h"));
  resizerV.forEach((resizer) => initResizer(resizer, "v"));
}
