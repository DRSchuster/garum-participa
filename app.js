/* Cada foto se sube tal cual. Los metadatos útiles van en exif_json. */

const cfg = window.GARUM_PARTICIPA || {};
const MAX = 5;
const TOPE = 50 * 1024 * 1024;
const TIPOS = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  dng: "image/x-adobe-dng"
};

let lang = "pt";
let textos = {};
let sitios = {};
let fotos = [];

function idSitio() {
  const partes = location.pathname.split("/").filter(Boolean);
  const i = partes.indexOf("s");
  return i >= 0 && partes[i + 1] ? decodeURIComponent(partes[i + 1]) : "";
}

function redirigir(id) {
  const nueva = String(cfg.nuevaDireccion || "").trim().replace(/\/$/, "");
  if (!nueva.startsWith("https://") || !id) return false;
  location.replace(nueva + "/s/" + encodeURIComponent(id));
  return true;
}

function t(clave) {
  const bloque = textos[lang] || textos.pt || {};
  return bloque[clave] || "";
}

function pestana(cual) {
  document.getElementById("panel-enviar").hidden = cual !== "enviar";
  document.getElementById("panel-ayuda").hidden = cual !== "ayuda";
  document.getElementById("tab-enviar").classList.toggle("activo", cual === "enviar");
  document.getElementById("tab-ayuda").classList.toggle("activo", cual === "ayuda");
}

function pintar() {
  const id = idSitio();
  const sitio = sitios[id];
  document.documentElement.lang = lang;
  document.getElementById("nombre").textContent = sitio ? sitio.nombre : id || "—";
  document.getElementById("proyecto").textContent = sitio ? sitio.proyecto : "GARUM";
  document.getElementById("tab-enviar").textContent = t("tab_enviar");
  document.getElementById("tab-ayuda").textContent = t("tab_ayuda");
  document.getElementById("instrucciones").textContent = t("instrucciones");
  document.getElementById("tit-foto").textContent = t("tab_ayuda");
  document.getElementById("tit-seg").textContent = t("tit_seguridad");
  document.getElementById("seguridad").textContent = t("seguridad");
  document.getElementById("tit-lic").textContent = t("tit_licencia");
  document.getElementById("licencia").textContent = t("licencia");
  document.getElementById("tit-datos").textContent = t("tit_datos");
  document.getElementById("rgpd").textContent = t("rgpd");
  document.getElementById("casilla-texto").textContent = t("consentimiento");
  document.getElementById("elegir").textContent = t("boton_foto");
  document.getElementById("etiqueta-nota").textContent = t("nota");
  document.getElementById("mas").textContent = t("mas");
  document.getElementById("mandar").textContent = t("boton_enviar");
  document.getElementById("pie").textContent = t("pie");
  document.querySelectorAll(".idiomas button").forEach((b) => {
    b.classList.toggle("activo", b.dataset.lang === lang);
  });
  const conocido = Boolean(sitio);
  document.getElementById("formulario").hidden = !conocido;
  if (!conocido) document.getElementById("estado").textContent = t("desconocido");
}

function idiomaInicial() {
  const nav = (navigator.language || "pt").slice(0, 2);
  return ["pt", "en", "es"].includes(nav) ? nav : "pt";
}

function extension(file) {
  const nombre = String(file.name || "").toLowerCase();
  const punto = nombre.lastIndexOf(".");
  return punto >= 0 ? nombre.slice(punto + 1) : "";
}

function tipoDe(file) {
  const ext = extension(file);
  if (TIPOS[ext]) return TIPOS[ext];
  const declarado = String(file.type || "");
  return Object.values(TIPOS).indexOf(declarado) >= 0 ? declarado : "";
}

function pintarFotos() {
  const caja = document.getElementById("miniaturas");
  caja.replaceChildren();
  fotos.forEach((item) => {
    const figura = document.createElement("div");
    figura.className = "mini";
    const img = document.createElement("img");
    img.alt = "";
    const url = URL.createObjectURL(item.file);
    img.src = url;
    img.onerror = () => {
      img.remove();
      const hueco = document.createElement("div");
      hueco.className = "hueco";
      hueco.textContent = extension(item.file).toUpperCase();
      figura.insertBefore(hueco, figura.firstChild);
    };
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.textContent = t("quitar");
    quitar.addEventListener("click", () => {
      URL.revokeObjectURL(url);
      fotos = fotos.filter((f) => f !== item);
      pintarFotos();
    });
    figura.append(img, quitar);
    caja.append(figura);
  });
}

function leerMeta(file) {
  return file.arrayBuffer().then((buf) => {
    try {
      return leerExif(buf) || {};
    } catch (err) {
      return {};
    }
  });
}

function enviarBinario(url, cabeceras, file, tipo, alAvanzar) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    Object.keys(cabeceras).forEach((k) => xhr.setRequestHeader(k, cabeceras[k]));
    xhr.setRequestHeader("Content-Type", tipo);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) alAvanzar(ev.loaded / ev.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("envio")));
    xhr.onerror = () => reject(new Error("red"));
    xhr.send(file);
  });
}

async function subirUna(id, file, meta) {
  const base = String(cfg.supabaseUrl || "").replace(/\/$/, "");
  const clave = String(cfg.clavePublica || "");
  if (!base.startsWith("https://") || !clave || clave.startsWith("sb_secret")) {
    throw new Error("cerrado");
  }
  const tipo = tipoDe(file);
  if (!tipo) throw new Error("tipo");
  if (file.size > TOPE) throw new Error("grande");
  const ruta = "contrib/" + id + "/" + crypto.randomUUID() + "." + extension(file);
  const cabeceras = { apikey: clave, Authorization: "Bearer " + clave };
  const barra = document.getElementById("avance");
  let ultimo = null;
  for (let intento = 0; intento < 2; intento++) {
    try {
      await enviarBinario(
        base + "/storage/v1/object/garum-fotos/" + ruta,
        cabeceras,
        file,
        tipo,
        (parte) => {
          barra.style.width = Math.round(parte * 100) + "%";
        }
      );
      ultimo = null;
      break;
    } catch (err) {
      ultimo = err;
      if (!err || err.message !== "red") throw err;
    }
  }
  if (ultimo) throw ultimo;
  const nota = document.getElementById("nota").value.trim().slice(0, 500);
  const fila = {
    sitio_id: id,
    qr_codigo: "portal-" + id,
    foto_path: ruta,
    consentimento_dado: true,
    estado_moderacao: "pendente",
    exif_json: meta && Object.keys(meta).length ? meta : {}
  };
  if (nota) fila.nota = nota;
  const alta = await fetch(base + "/rest/v1/contribuicoes", {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json", Prefer: "return=minimal" },
      cabeceras
    ),
    body: JSON.stringify(fila)
  });
  if (!alta.ok) throw new Error("envio");
}

async function arranque() {
  const id = idSitio();
  if (redirigir(id)) return;
  const [tjs, sjs] = await Promise.all([
    fetch("textos.json").then((r) => r.json()),
    fetch("sitios.json").then((r) => r.json())
  ]);
  textos = tjs;
  sitios = sjs;
  lang = idiomaInicial();
  document.querySelectorAll(".idiomas button").forEach((b) => {
    b.addEventListener("click", () => {
      lang = b.dataset.lang;
      pintar();
      pintarFotos();
    });
  });
  document.getElementById("tab-enviar").addEventListener("click", () => pestana("enviar"));
  document.getElementById("tab-ayuda").addEventListener("click", () => pestana("ayuda"));
  document.getElementById("mas").addEventListener("click", () => pestana("ayuda"));
  document.getElementById("foto").addEventListener("change", (ev) => {
    const lista = Array.from(ev.target.files || []);
    ev.target.value = "";
    lista.forEach((file) => {
      if (fotos.length >= MAX) return;
      fotos.push({ file: file });
    });
    if (lista.length > MAX) document.getElementById("estado").textContent = t("max_fotos");
    pintarFotos();
  });
  document.getElementById("mandar").addEventListener("click", async () => {
    const estado = document.getElementById("estado");
    if (!document.getElementById("casilla").checked) {
      estado.textContent = t("falta_casilla");
      return;
    }
    if (!fotos.length) {
      estado.textContent = t("falta_foto");
      return;
    }
    const boton = document.getElementById("mandar");
    const barra = document.getElementById("progreso");
    boton.disabled = true;
    barra.hidden = false;
    const pendientes = fotos.slice();
    try {
      for (let i = 0; i < pendientes.length; i++) {
        const file = pendientes[i].file;
        estado.textContent = t("progreso") + " " + (i + 1) + "/" + pendientes.length;
        document.getElementById("avance").style.width = "0";
        if (file.size > TOPE) throw new Error("grande");
        const meta = await leerMeta(file);
        await subirUna(id, file, meta);
        fotos = fotos.filter((f) => f !== pendientes[i]);
        pintarFotos();
      }
      estado.textContent = t("gracias");
      document.getElementById("formulario").hidden = true;
    } catch (err) {
      const codigo = err && err.message;
      if (codigo === "cerrado") estado.textContent = t("cerrado");
      else if (codigo === "grande") estado.textContent = t("demasiado_grande");
      else if (codigo === "tipo") estado.textContent = t("foto_mala");
      else estado.textContent = t("error_envio");
      boton.disabled = false;
    }
    barra.hidden = true;
  });
  pintar();
  pestana("enviar");
}

arranque().catch(() => {
  const estado = document.getElementById("estado");
  if (estado) estado.textContent = "GARUM";
});
