// The part of the `qrcode` package the admin uses (it ships no types).
declare module "qrcode" {
  interface QRCodeModules {
    size: number;
    data: Uint8Array;
    get(row: number, col: number): number;
  }
  interface QRCodeData {
    modules: QRCodeModules;
    version: number;
  }
  function create(
    text: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): QRCodeData;
  const QRCode: { create: typeof create };
  export default QRCode;
}
