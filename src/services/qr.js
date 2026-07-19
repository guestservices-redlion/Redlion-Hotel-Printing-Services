import { createRequire } from "node:module";
import zlib from "node:zlib";
const require = createRequire(import.meta.url);
const QRCode = require("../vendor/qrcode/index.js");
const QRErrorCorrectLevel = require("../vendor/qrcode/QRErrorCorrectLevel.js");
function matrix(value) {
    const qr = new QRCode(-1, QRErrorCorrectLevel.M);
    qr.addData(value);
    qr.make();
    return qr.modules;
}
export function qrSvg(value, scale = 12, margin = 4) {
    const modules = matrix(value);
    const size = modules.length + margin * 2;
    const paths = [];
    for (let y = 0; y < modules.length; y += 1) {
        for (let x = 0; x < modules.length; x += 1) {
            if (modules[y]?.[x])
                paths.push(`M${x + margin},${y + margin}h1v1h-1z`);
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * scale}" height="${size * scale}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join("")}" fill="#000"/></svg>`;
}
function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const typeBuffer = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
    return Buffer.concat([length, typeBuffer, data, checksum]);
}
export function qrPng(value, scale = 12, margin = 4) {
    const modules = matrix(value);
    const moduleSize = modules.length + margin * 2;
    const width = moduleSize * scale;
    const raw = Buffer.alloc((width + 1) * width, 255);
    for (let y = 0; y < width; y += 1) {
        const rowStart = y * (width + 1);
        raw[rowStart] = 0;
        for (let x = 0; x < width; x += 1) {
            const moduleX = Math.floor(x / scale) - margin;
            const moduleY = Math.floor(y / scale) - margin;
            const dark = moduleX >= 0 &&
                moduleY >= 0 &&
                moduleY < modules.length &&
                moduleX < modules.length &&
                Boolean(modules[moduleY]?.[moduleX]);
            raw[rowStart + 1 + x] = dark ? 0 : 255;
        }
    }
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(width, 4);
    header[8] = 8;
    header[9] = 0;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;
    return Buffer.concat([
        signature,
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}
//# sourceMappingURL=qr.js.map