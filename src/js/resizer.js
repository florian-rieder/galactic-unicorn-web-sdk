function initResizer(resizer, direction) {
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();

    const prev = resizer.previousElementSibling;
    const next = resizer.nextElementSibling;
    const prop = direction === "h" ? "height" : "width";
    const startPos = direction === "h" ? e.clientY : e.clientX;
    const startSizeA = prev.getBoundingClientRect()[prop];
    const startSizeB = next.getBoundingClientRect()[prop];

    prev.style.flex = `0 0 ${startSizeA}px`;
    next.style.flex = `0 0 ${startSizeB}px`;
    document.body.style.cursor =
      direction === "h" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";

    function onMove(e) {
      const delta =
        direction === "h" ? e.clientY - startPos : e.clientX - startPos;
      prev.style.flex = `0 0 ${Math.max(40, startSizeA + delta)}px`;
      next.style.flex = `0 0 ${Math.max(40, startSizeB - delta)}px`;
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
