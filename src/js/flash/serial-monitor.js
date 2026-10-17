/**
 * Serial monitor: stream the device's serial output
 *
 * The monitor reconnects automatically when the device drops off the bus
 * (resets can re-enumerate the USB device), and keeps running until stopped.
 */

import { findAuthorizedPort } from "./serial-port.js";

const MONITOR_BAUDRATE = 115200;
// How long to wait before looking for the device again after it was lost
const RECONNECT_DELAY_MS = 250;

let controller = null;
let loop = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const SerialMonitor = Object.freeze({
  isRunning() {
    return controller !== null;
  },

  /**
   * Start streaming the console's serial output. Restarts the monitor if it is already running.
   *
   * @param {{
   *  onData: (text: string) => void,
   *  onConnect?: () => void,
   *  onDisconnect?: () => void,
   * }} callbacks
   */
  async start(callbacks) {
    await this.stop();
    controller = new AbortController();
    loop = run(controller.signal, callbacks);
  },

  /**
   * Stop the monitor and wait for the port to be released.
   */
  async stop() {
    if (!controller) return;
    controller.abort();
    await loop;
    controller = null;
    loop = null;
  },
});

async function run(signal, { onData, onConnect, onDisconnect }) {
  const decoder = new TextDecoder();

  while (!signal.aborted) {
    const port = await findAuthorizedPort();
    if (!port) {
      await sleep(RECONNECT_DELAY_MS);
      continue;
    }

    let connected = false;
    try {
      await port.open({ baudRate: MONITOR_BAUDRATE });
      // Set both lines in one request: on the USB-Serial-JTAG, RTS high with DTR low resets the chip
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });

      connected = true;
      if (onConnect) onConnect();

      const reader = port.readable.getReader();
      const cancel = () => reader.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          onData(decoder.decode(value, { stream: true }).replaceAll("\r", ""));
        }
      } finally {
        signal.removeEventListener("abort", cancel);
        reader.releaseLock();
      }
    } catch (error) {
      // Device lost (reset or unplugged) or port busy: retry below
      console.debug("Serial monitor:", error);
    } finally {
      try {
        await port.close();
      } catch {
        // Port was never opened, or the device is already gone
      }
    }

    if (connected && !signal.aborted && onDisconnect) onDisconnect();
    if (!signal.aborted) await sleep(RECONNECT_DELAY_MS);
  }
}
