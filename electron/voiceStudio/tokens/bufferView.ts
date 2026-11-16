/** Safe Buffer copy from a TypedArray view (V15 — never use bare .buffer). */
export function bufferFromView(view: ArrayBufferView): Buffer {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}
