import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decodes the 8-bit truecolour RGBA PNGs the icon pipeline emits. Only the
 * subset those files use is supported: any other header is a hard failure
 * rather than a silently empty pixel grid.
 */
export function decodeRgbaPng(png) {
  assertPngSignature(png);
  let header = null;
  const compressed = [];
  for (let offset = 8; offset + 12 <= png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = readIhdr(data);
    else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (header === null) throw new Error("PNG has no IHDR chunk");
  const scanlines = inflateSync(Buffer.concat(compressed));
  return { ...header, ...unfilter(header, scanlines) };
}

function assertPngSignature(png) {
  if (!PNG_SIGNATURE.equals(png.subarray(0, 8))) {
    throw new Error("payload is not a PNG");
  }
}

function readIhdr(data) {
  const bitDepth = data[8];
  const colorType = data[9];
  const interlace = data[12];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`,
    );
  }
  return { width: data.readUInt32BE(0), height: data.readUInt32BE(4) };
}

function unfilter({ width, height }, scanlines) {
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  let previous = Buffer.alloc(stride);
  for (let row = 0; row < height; row += 1) {
    const filter = scanlines[source++];
    const current = pixels.subarray(row * stride, (row + 1) * stride);
    scanlines.copy(current, 0, source, source + stride);
    source += stride;
    applyFilter(filter, current, previous, stride);
    previous = current;
  }
  return { pixels };
}

function applyFilter(filter, current, previous, stride) {
  if (filter === 0) return;
  for (let x = 0; x < stride; x += 1) {
    const left = x >= 4 ? current[x - 4] : 0;
    const up = previous[x];
    const upperLeft = x >= 4 ? previous[x - 4] : 0;
    let predictor;
    switch (filter) {
      case 1:
        predictor = left;
        break;
      case 2:
        predictor = up;
        break;
      case 3:
        predictor = (left + up) >> 1;
        break;
      case 4:
        predictor = paeth(left, up, upperLeft);
        break;
      default:
        throw new Error(`unknown PNG filter ${filter}`);
    }
    current[x] = (current[x] + predictor) & 0xff;
  }
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upperLeft;
}
