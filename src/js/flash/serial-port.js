const ALLOWED_SERIAL_DEVICES = [
  { usbVendorId: 0x303a, usbProductId: 0x1001 }, // ESP32-C6
];

/**
 * Find a console port the user has already allowed access to, without prompting.
 *
 * @returns {Promise<SerialPort | undefined>}
 */
export async function findAuthorizedPort() {
  const ports = await navigator.serial.getPorts();
  return ports.find((p) => {
    if (p.connected === false) return false;

    const { usbVendorId, usbProductId } = p.getInfo();
    return ALLOWED_SERIAL_DEVICES.some(
      (device) =>
        usbVendorId === device.usbVendorId &&
        usbProductId === device.usbProductId
    );
  });
}

/**
 * Get the console port, prompting the user to select it if they haven't allowed it yet.
 *
 * @returns {Promise<SerialPort | null>} null if the user cancelled the port picker.
 */
export async function requestPort() {
  try {
    // Check if the user already allowed serial access to the console
    const port = await findAuthorizedPort();
    if (port) return port;

    // User will be prompted to select the console and allow serial access
    return await navigator.serial.requestPort({
      filters: ALLOWED_SERIAL_DEVICES,
    });
  } catch (error) {
    // User cancelled the port selection dialog, do nothing.
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return null;
    }
    throw error;
  }
}
