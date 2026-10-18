/* Lee fecha, posición y cámara. No devuelve serie, propietario ni identificador. */

function _texto(view, offset, n) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function _valor(view, tipo, n, offset, le) {
  const anchos = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const ancho = anchos[tipo] || 1;
  const bytes = ancho * n;
  let pos = offset;
  if (bytes <= 4) pos = offset;
  const nums = [];
  for (let i = 0; i < n; i++) {
    const p = pos + i * ancho;
    if (p + ancho > view.byteLength) break;
    if (tipo === 1 || tipo === 7) nums.push(view.getUint8(p));
    else if (tipo === 2) return _texto(view, pos, n);
    else if (tipo === 3) nums.push(view.getUint16(p, le));
    else if (tipo === 4) nums.push(view.getUint32(p, le));
    else if (tipo === 9) nums.push(view.getInt32(p, le));
    else if (tipo === 5 || tipo === 10) {
      const a = tipo === 5 ? view.getUint32(p, le) : view.getInt32(p, le);
      const b = view.getUint32(p + 4, le);
      nums.push(b ? a / b : 0);
    }
  }
  if (tipo === 2) return "";
  return n === 1 ? nums[0] : nums;
}

function _ifd(view, pos, le, base) {
  const salida = {};
  if (pos + 2 > view.byteLength) return salida;
  const n = view.getUint16(pos, le);
  let cursor = pos + 2;
  for (let i = 0; i < n; i++) {
    if (cursor + 12 > view.byteLength) break;
    const tag = view.getUint16(cursor, le);
    const tipo = view.getUint16(cursor + 2, le);
    const cuenta = view.getUint32(cursor + 4, le);
    let dato = view.getUint32(cursor + 8, le);
    const anchos = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const bytes = (anchos[tipo] || 1) * cuenta;
    if (bytes > 4) dato = base + dato;
    else dato = cursor + 8;
    salida[tag] = _valor(view, tipo, cuenta, dato, le);
    cursor += 12;
  }
  const siguiente = cursor + 4 <= view.byteLength ? view.getUint32(cursor, le) : 0;
  return { tags: salida, siguiente: siguiente ? base + siguiente : 0 };
}

function _gps(tags) {
  function grados(valor, ref) {
    if (!Array.isArray(valor) || valor.length < 3) return null;
    let n = Number(valor[0]) + Number(valor[1]) / 60 + Number(valor[2]) / 3600;
    if (ref === "S" || ref === "W") n = -n;
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1e6) / 1e6;
  }
  const lat = grados(tags[2], tags[1]);
  const lon = grados(tags[4], tags[3]);
  const out = {};
  if (lat != null && lon != null) {
    out.latitud = lat;
    out.longitud = lon;
  }
  if (typeof tags[6] === "number") {
    const abajo = tags[5] === 1;
    out.altitud = Math.round((abajo ? -tags[6] : tags[6]) * 10) / 10;
  }
  if (typeof tags[31] === "number") out.precision_gps = Math.round(tags[31] * 10) / 10;
  if (typeof tags[17] === "number") out.direccion = Math.round(tags[17] * 10) / 10;
  return out;
}

function _fecha(valor) {
  const s = String(valor || "");
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return "";
  return m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + m[6];
}

function deTiff(bytes) {
  if (!bytes || bytes.length < 8) return {};
  const orden = String.fromCharCode(bytes[0], bytes[1]);
  if (orden !== "II" && orden !== "MM") return {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = orden === "II";
  if (view.getUint16(2, le) !== 42) return {};
  const primero = view.getUint32(4, le);
  const ifd0 = _ifd(view, primero, le, 0);
  const tags = ifd0.tags || {};
  const exifPos = tags[34665];
  const gpsPos = tags[34853];
  const exif = typeof exifPos === "number" ? _ifd(view, exifPos, le, 0).tags || {} : {};
  const gps = typeof gpsPos === "number" ? _ifd(view, gpsPos, le, 0).tags || {} : {};
  const out = _gps(gps);
  const fecha = _fecha(exif[36867] || exif[36868] || tags[306]);
  if (fecha) out.fecha = fecha;
  if (tags[271]) out.marca = String(tags[271]);
  if (tags[272]) out.modelo = String(tags[272]);
  if (exif[42036]) out.objetivo = String(exif[42036]);
  if (typeof exif[37386] === "number") out.distancia_focal = Math.round(exif[37386] * 100) / 100;
  const orientacion = tags[274] || exif[274];
  if (typeof orientacion === "number") out.orientacion = orientacion;
  const ancho = exif[40962] || tags[256];
  const alto = exif[40963] || tags[257];
  if (typeof ancho === "number") out.ancho = ancho;
  if (typeof alto === "number") out.alto = alto;
  return out;
}

function deXmp(texto) {
  const xml = String(texto || "");
  const out = {};
  function num(nombre) {
    const re = new RegExp(nombre + '="([^"]+)"|' + nombre + ">([^<]+)<", "i");
    const m = xml.match(re);
    if (!m) return null;
    const n = Number(m[1] || m[2]);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }
  const altura = num("RelativeAltitude");
  const inclina = num("GimbalPitchDegree");
  const rumbo = num("GimbalYawDegree");
  if (altura != null) out.altura_relativa = altura;
  if (inclina != null) out.inclinacion = inclina;
  if (rumbo != null) out.direccion_gimbal = rumbo;
  return out;
}

function _bloquesExif(bytes) {
  const lista = [];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 4 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marca = bytes[i + 1];
      if (marca === 0xda || marca === 0xd9) break;
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      const ini = i + 4;
      const fin = ini + len - 2;
      if (marca === 0xe1 && fin <= bytes.length) lista.push(bytes.subarray(ini, fin));
      if (len < 2) break;
      i = fin;
    }
    return lista;
  }
  if (bytes[0] === 0x49 || bytes[0] === 0x4d) lista.push(bytes);
  const firma = [0x45, 0x78, 0x69, 0x66, 0, 0];
  for (let i = 0; i < bytes.length - 14; i++) {
    let ok = true;
    for (let k = 0; k < 6; k++) if (bytes[i + k] !== firma[k]) ok = false;
    if (ok) lista.push(bytes.subarray(i + 6));
  }
  return lista;
}

function leerExif(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let out = {};
  for (const bloque of _bloquesExif(bytes)) {
    let tiff = bloque;
    const cabeza = String.fromCharCode.apply(null, bloque.subarray(0, 6));
    if (cabeza === "Exif\u0000\u0000") tiff = bloque.subarray(6);
    const leido = deTiff(tiff);
    out = Object.assign(out, leido);
    const texto = new TextDecoder("utf-8", { fatal: false }).decode(bloque);
    if (texto.indexOf("xmpmeta") >= 0 || texto.indexOf("RelativeAltitude") >= 0) {
      out = Object.assign(out, deXmp(texto));
    }
  }
  const limpio = {};
  Object.keys(out).forEach((clave) => {
    if (/serial|owner|artist|unique|document|instance|propiet/i.test(clave)) return;
    const valor = out[clave];
    if (valor === "" || valor == null) return;
    limpio[clave] = valor;
  });
  let json = JSON.stringify(limpio);
  if (json.length > 4000) {
    delete limpio.objetivo;
    json = JSON.stringify(limpio);
  }
  return json.length > 4000 ? {} : limpio;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { leerExif, deXmp };
}
