/* Una página. La foto se redibuja antes de subir: no salen coordenadas ni datos de cámara. */

const cfg = window.GARUM_PARTICIPA || {};
let lang = "pt";
let textos = {};
let sitios = {};
let archivo = null;

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

function pintar() {
  const id = idSitio();
  const sitio = sitios[id];
  document.documentElement.lang = lang;
  document.getElementById("aviso").textContent = t("aviso");
  document.getElementById("nombre").textContent = sitio ? sitio.nombre : id || "—";
  document.getElementById("proyecto").textContent = sitio ? sitio.proyecto : "GARUM";
  document.getElementById("instrucciones").textContent = t("instrucciones");
  document.getElementById("seguridad").textContent = t("seguridad");
  document.getElementById("enviar").textContent = t("enviar");
  document.getElementById("licencia").textContent = t("licencia");
  document.getElementById("rgpd").textContent = t("rgpd");
  document.getElementById("casilla-texto").textContent = t("consentimiento");
  document.getElementById("elegir").textContent = t("boton_foto");
  document.getElementById("etiqueta-nota").textContent = t("nota");
  document.getElementById("mandar").textContent = t("boton_enviar");
  document.querySelectorAll(".idiomas button").forEach((b) => {
    b.classList.toggle("activo", b.dataset.lang === lang);
  });
  const conocido = Boolean(sitio);
  document.getElementById("formulario").hidden = !conocido;
  if (!conocido) {
    document.getElementById("estado").textContent = t("desconocido");
  }
}

function idiomaInicial() {
  const nav = (navigator.language || "pt").slice(0, 2);
  return ["pt", "en", "es"].includes(nav) ? nav : "pt";
}

async function sinDatos(file) {
  const bmp = await createImageBitmap(file);
  const max = 2000;
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * escala));
  const h = Math.max(1, Math.round(bmp.height * escala));
  const lienzo = document.createElement("canvas");
  lienzo.width = w;
  lienzo.height = h;
  lienzo.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("foto");
  return blob;
}

async function subir(id, blob) {
  const base = String(cfg.supabaseUrl || "").replace(/\/$/, "");
  const clave = String(cfg.clavePublica || "");
  if (!base.startsWith("https://") || !clave || clave.startsWith("sb_secret")) {
    throw new Error("cerrado");
  }
  if (blob.size > 15 * 1024 * 1024) throw new Error("envio");
  const ruta = "contrib/" + id + "/" + crypto.randomUUID() + ".jpg";
  const cabeceras = { apikey: clave, Authorization: "Bearer " + clave };
  const foto = await fetch(base + "/storage/v1/object/garum-fotos/" + ruta, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "image/jpeg", "x-upsert": "false" }, cabeceras),
    body: blob
  });
  if (!foto.ok) throw new Error("envio");
  const nota = document.getElementById("nota").value.trim().slice(0, 500);
  const fila = {
    sitio_id: id,
    qr_codigo: "portal-" + id,
    foto_path: ruta,
    consentimento_dado: true,
    estado_moderacao: "pendente"
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
    });
  });
  document.getElementById("foto").addEventListener("change", (ev) => {
    archivo = ev.target.files && ev.target.files[0] ? ev.target.files[0] : null;
    document.getElementById("estado").textContent = archivo ? archivo.name : "";
  });
  document.getElementById("mandar").addEventListener("click", async () => {
    const estado = document.getElementById("estado");
    if (!document.getElementById("casilla").checked) {
      estado.textContent = t("falta_casilla");
      return;
    }
    if (!archivo) {
      estado.textContent = t("falta_foto");
      return;
    }
    document.getElementById("mandar").disabled = true;
    try {
      const blob = await sinDatos(archivo);
      await subir(id, blob);
      estado.textContent = t("gracias");
      document.getElementById("formulario").hidden = true;
    } catch (err) {
      estado.textContent = err && err.message === "cerrado" ? t("cerrado") : t("error_envio");
      document.getElementById("mandar").disabled = false;
    }
  });
  pintar();
}

arranque().catch(() => {
  document.getElementById("estado").textContent = "GARUM";
});
