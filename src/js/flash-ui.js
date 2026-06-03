/**
 * Flash UI: SweetAlert2 modal wrapping EspFlasher.flash()
 */

import Swal from "sweetalert2";

import { EspFlasher } from "./flasher.js";
import { Terminal } from "./terminal.js";

const setStatus = (text) =>
  (Swal.getHtmlContainer().querySelector(".flash-status").textContent = text);

/**
 * Run the full flash flow with a SweetAlert2 progress modal.
 * Opens the modal only after the user picks a serial port.
 * Resolves silently if the port picker is cancelled.
 */
export async function flashWithUi() {
  let progressBar = null;
  let label = null;

  try {
    const duration = await EspFlasher.flash({
      onPortSelected() {
        Swal.fire({
          title: "Flashing device",
          html: `<p class="flash-status">Building filesystem image...</p>`,
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          heightAuto: false,
          didOpen: () => Swal.showLoading(),
        });
      },

      onConnecting() {
        setStatus("Connecting to device...");
      },

      onProgress(_fileIndex, written, total) {
        const ratio = total > 0 ? written / total : 0;

        if (!progressBar) {
          Swal.hideLoading();
          setStatus("Writing to device...");
          const container = Swal.getHtmlContainer();
          container.insertAdjacentHTML(
            "beforeend",
            `<div class="flash-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100">
              <div class="flash-progress-bar"></div>
            </div>
            <p class="flash-progress-label"></p>`,
          );
          progressBar = container.querySelector(".flash-progress-bar");
          label = container.querySelector(".flash-progress-label");
        }

        const percent = Math.round(ratio * 100);
        progressBar.style.width = `${percent}%`;
        progressBar.parentElement.setAttribute("aria-valuenow", percent);
        label.textContent = `${percent}%`;
      },
    });

    if (duration === null) return;

    const seconds = (duration / 1000).toFixed(1);

    await Swal.fire({
      icon: "success",
      title: "Flash complete",
      text: `Filesystem written in ${seconds}s`,
    });
  } catch (error) {
    Terminal.printLine(error.message);
    console.error(error);

    await Swal.fire({
      icon: "error",
      title: "Flash failed",
      text: error.message,
    });
  }
}
