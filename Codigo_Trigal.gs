/* ============================================================
   El Trigal · registro diario de producción (Google Apps Script)
   Cambia CLAVE por la clave del equipo.
   Después de cada cambio: Implementar > Administrar implementaciones > Versión nueva.
   Guarda: fase, fecha, producto, horneados, sobraron. Lo demás lo calcula el servidor.
   ============================================================ */
var CLAVE = "Trigal12345";
var HOJA = "Diario";
var SS_ID = "1SNxNmvnbhtrOgaYIzRGI1ie8dzx3L0bdsdl5Vni9Wvg";
var ZONA = "America/Bogota";
var CABECERA = ["Fase", "Fecha", "Día", "Producto", "Horneados", "Vendidos", "Sobraron", "Se acabó", "Costo de lo que sobró", "Actualizado"];
var PRODUCTOS = { "Pan blanco": 400, "Pan de queso": 700, "Pastelito": 900, "Almojábana": 600 };
var INICIO_LINEA_BASE = "2026-08-11";
var INICIO_PRUEBA = "2026-10-06";
var FIN_REGISTRO = "2026-12-31";
var DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function doGet(e) {
  return salida({ ok: true, mensaje: "El Trigal: registro activo. Usa la página del proyecto." });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var p = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (String(p.clave || "") !== CLAVE) return salida({ ok: false, error: "Clave incorrecta." });
    var accion = String(p.accion || "");
    if (accion === "verificar") return salida({ ok: true, mensaje: "Clave correcta." });
    if (accion === "listar") return salida({ ok: true, datos: leerDatos() });
    if (accion === "guardar") return salida(guardar(p));
    if (accion === "borrar") return salida(borrar(p));
    return salida({ ok: false, error: "Acción no reconocida." });
  } catch (err) {
    return salida({ ok: false, error: "Error en el servidor: " + err.message });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoja() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var h = ss.getSheetByName(HOJA);
  if (!h) {
    h = ss.insertSheet(HOJA);
    h.getRange(1, 1, 1, CABECERA.length).setValues([CABECERA]).setFontWeight("bold");
    h.setFrozenRows(1);
  }
  return h;
}

function zona() {
  return ZONA;
}

/* Las fechas llegan como texto ISO o como fecha de Sheets: se normalizan a AAAA-MM-DD */
function fechaTexto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, zona(), "yyyy-MM-dd");
  var t = String(v == null ? "" : v).trim();
  var m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return t.slice(0, 10);
}

function texto(v) {
  return String(v == null ? "" : v).trim();
}

function numero(v) {
  var t = texto(v).replace(",", ".");
  if (t === "") return null;
  var n = Number(t);
  return isNaN(n) ? null : n;
}

function nombreDia(fecha) {
  var d = new Date(fecha + "T12:00:00-05:00");
  return DIAS[d.getDay()];
}

function faseDe(fecha) {
  return fecha < INICIO_PRUEBA ? "Línea base" : "Prueba";
}

function leerDatos() {
  var h = hoja();
  var ultima = h.getLastRow();
  if (ultima < 2) return [];
  var filas = h.getRange(2, 1, ultima - 1, CABECERA.length).getValues();
  return filas.filter(function (f) { return fechaTexto(f[1]) !== "" && texto(f[3]) !== ""; }).map(function (f) {
    return {
      fase: texto(f[0]),
      fecha: fechaTexto(f[1]),
      dia: texto(f[2]),
      producto: texto(f[3]),
      horneados: numero(f[4]) || 0,
      vendidos: numero(f[5]) || 0,
      sobraron: numero(f[6]) || 0,
      seAcabo: texto(f[7]),
      costo: numero(f[8]) || 0
    };
  });
}

function validarFila(f) {
  var fecha = fechaTexto(f.fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "La fecha debe tener formato AAAA-MM-DD.";
  if (fecha < INICIO_LINEA_BASE || fecha > FIN_REGISTRO) return "La fecha debe estar entre el 11 de agosto y el 31 de diciembre de 2026.";
  if (!PRODUCTOS.hasOwnProperty(texto(f.producto))) return "Elige un producto de la lista.";
  var horneados = numero(f.horneados);
  if (horneados === null || horneados < 0 || horneados > 300 || Math.floor(horneados) !== horneados) return "Horneados debe ser un número entero entre 0 y 300.";
  var sobraron = numero(f.sobraron);
  if (sobraron === null || sobraron < 0 || Math.floor(sobraron) !== sobraron) return "Sobraron debe ser un número entero, 0 o más.";
  if (sobraron > horneados) return "Sobraron no puede ser mayor que lo horneado.";
  return "";
}

function buscarFila(h, fecha, producto) {
  var ultima = h.getLastRow();
  if (ultima < 2) return 0;
  /* Columnas A a D: Fase, Fecha, Día, Producto */
  var v = h.getRange(2, 1, ultima - 1, 4).getValues();
  for (var i = 0; i < v.length; i++) {
    if (fechaTexto(v[i][1]) === fecha && texto(v[i][3]) === producto) return i + 2;
  }
  return 0;
}

function guardar(p) {
  var f = p.fila || {};
  var err = validarFila(f);
  if (err) return { ok: false, error: err };
  var fecha = fechaTexto(f.fecha);
  var producto = texto(f.producto);
  var horneados = numero(f.horneados);
  var sobraron = numero(f.sobraron);
  var vendidos = horneados - sobraron;
  var seAcabo = sobraron === 0 ? "Sí" : "No";
  var costo = sobraron * PRODUCTOS[producto];
  var datos = [
    faseDe(fecha), fecha, nombreDia(fecha), producto, horneados, vendidos, sobraron, seAcabo, costo,
    Utilities.formatDate(new Date(), zona(), "yyyy-MM-dd HH:mm")
  ];
  var h = hoja();
  var fila = buscarFila(h, fecha, producto);
  if (fila) {
    h.getRange(fila, 1, 1, CABECERA.length).setValues([datos]);
    return { ok: true, mensaje: producto + " del " + fecha + " actualizado." };
  }
  h.appendRow(datos);
  return { ok: true, mensaje: producto + " del " + fecha + " guardado." };
}

function borrar(p) {
  var h = hoja();
  var fila = buscarFila(h, fechaTexto(p.fecha), texto(p.producto));
  if (!fila) return { ok: false, error: "No encuentro ese registro." };
  h.deleteRow(fila);
  return { ok: true, mensaje: "Registro borrado." };
}
