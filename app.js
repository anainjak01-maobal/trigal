(function () {
  "use strict";
  var CFG = window.TRIGAL_CONFIG || {};
  var clave = "", datos = [];
  var PRODUCTOS = ["Pan blanco", "Pan de queso", "Pastelito", "Almojábana"];
  var COSTO = { "Pan blanco": 400, "Pan de queso": 700, "Pastelito": 900, "Almojábana": 600 };
  var FECHA_PRUEBA = "2026-10-06";
  var DIAS_ORDEN = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  var VISTAS = ["panel", "registrar", "registros"];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function msg(el, t, tipo) { el.textContent = t; el.className = "msg" + (tipo ? " " + tipo : ""); }
  function n1(x) { return x == null || isNaN(x) ? "—" : Number(x).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function n0(x) { return Math.round(x).toLocaleString("es-CO"); }
  function cop(x) { return "$" + n0(x || 0); }
  function dmy(iso) { var p = String(iso).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
  function fase(fecha) { return fecha < FECHA_PRUEBA ? "Línea base" : "Prueba"; }

  function enviar(accion, extra) {
    if (!CFG.REGISTRO) return Promise.resolve({ ok: false, error: "Falta la dirección del registro en config.js." });
    var cuerpo = Object.assign({ accion: accion, clave: clave }, extra || {});
    return fetch(CFG.REGISTRO, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "No hay conexión con el registro. Intenta de nuevo." }; });
  }

  /* ---------- Cálculos (los mismos de la planilla) ---------- */
  function diasDe(f) {
    var set = {};
    datos.forEach(function (d) { if (d.fase === f) set[d.fecha] = true; });
    return Object.keys(set).length;
  }
  function resumen(f) {
    var rs = datos.filter(function (d) { return d.fase === f; });
    var dias = diasDe(f);
    var sob = 0, costo = 0, por = {};
    PRODUCTOS.forEach(function (p) { por[p] = { sobr: 0, acabo: 0, costo: 0 }; });
    rs.forEach(function (d) {
      sob += d.sobraron; costo += d.costo;
      if (por[d.producto]) {
        por[d.producto].sobr += d.sobraron;
        por[d.producto].costo += d.costo;
        if (d.seAcabo === "Sí") por[d.producto].acabo++;
      }
    });
    return {
      dias: dias, sobra: sob, costo: costo,
      sobraDia: dias ? sob / dias : null,
      costoDia: dias ? costo / dias : null,
      por: por
    };
  }
  function porDiaProducto(r, p) { return r.dias ? r.por[p].sobr / r.dias : null; }

  /* ---------- Acceso y navegación ---------- */
  function mostrar(vista) {
    VISTAS.forEach(function (v) { $("vista-" + v).hidden = v !== vista; });
    document.querySelectorAll("[data-vista]").forEach(function (b) {
      b.setAttribute("aria-current", b.dataset.vista === vista ? "page" : "false");
    });
    if (vista === "panel") pintarPanel();
    if (vista === "registrar") actualizarPrevia();
    if (vista === "registros") pintarRegistros();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("[data-vista]").forEach(function (b) {
    b.addEventListener("click", function () { mostrar(b.dataset.vista); });
  });
  $("acc-form").addEventListener("submit", function (e) {
    e.preventDefault();
    clave = $("clave").value;
    if (!clave) return;
    $("acc-btn").disabled = true; msg($("acc-msg"), "Entrando…");
    enviar("verificar").then(function (r) {
      $("acc-btn").disabled = false;
      if (!r.ok) { clave = ""; msg($("acc-msg"), r.error || "Clave incorrecta.", "error"); return; }
      $("clave").value = "";
      $("vista-acceso").hidden = true;
      $("barra").hidden = false;
      $("titulo").textContent = "Registro de producción";
      limpiarFormulario();
      cargarTodo().then(function () { mostrar("panel"); });
    });
  });
  $("salir").addEventListener("click", function () {
    clave = ""; datos = [];
    VISTAS.forEach(function (v) { $("vista-" + v).hidden = true; });
    $("barra").hidden = true;
    $("vista-acceso").hidden = false;
    $("titulo").textContent = "Entrar";
    msg($("acc-msg"), "");
  });

  function cargarTodo() {
    return enviar("listar").then(function (r) {
      if (!r.ok) { msg($("g-msg"), r.error || "No pude cargar los datos.", "error"); return; }
      datos = (r.datos || []).map(function (d) {
        return {
          fase: d.fase, fecha: d.fecha, dia: d.dia, producto: d.producto,
          horneados: Number(d.horneados) || 0, vendidos: Number(d.vendidos) || 0,
          sobraron: Number(d.sobraron) || 0, seAcabo: d.seAcabo, costo: Number(d.costo) || 0
        };
      });
      pintarPanel();
      pintarRegistros();
    });
  }

  /* ---------- Panel ---------- */
  function contar(el, hasta, formato) {
    var inicio = performance.now(), dur = 900;
    function paso(t) {
      var k = Math.min(1, (t - inicio) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = formato(hasta * e);
      if (k < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  function pintarPanel() {
    if (!datos.length) {
      ["duelo", "tabla-producto", "tabla-semana"].forEach(function (id) { $(id).innerHTML = ""; });
      $("grafico").innerHTML = '<p class="muted">Todavía no hay registros. Revisa que la hoja tenga una pestaña llamada "Diario" con los datos iniciales.</p>';
      $("duelo-nota").textContent = "";
      return;
    }
    var base = resumen("Línea base"), prueba = resumen("Prueba");

    /* Duelo */
    $("duelo").innerHTML =
      '<article class="duelo-lado"><p class="etiq">Línea base · ' + base.dias + ' días</p>' +
      '<p class="cifra" data-valor="' + (base.sobraDia || 0) + '" data-dec="1">' + n1(base.sobraDia) + '</p>' +
      '<p class="det">unidades que sobraron por día · costo ' + cop(base.costoDia) + ' por día</p></article>' +
      '<div class="duelo-vs" aria-hidden="true">→</div>' +
      '<article class="duelo-lado prueba"><p class="etiq">Prueba del horno nuevo · ' + prueba.dias + ' días</p>' +
      '<p class="cifra" data-valor="' + (prueba.sobraDia || 0) + '" data-dec="1">' + n1(prueba.sobraDia) + '</p>' +
      '<p class="det">unidades que sobraron por día · costo ' + cop(prueba.costoDia) + ' por día</p></article>';
    document.querySelectorAll(".cifra").forEach(function (el) {
      var v = Number(el.dataset.valor);
      contar(el, v, function (x) { return n1(x); });
    });
    if (base.sobraDia && prueba.sobraDia != null) {
      var baja = Math.round((1 - prueba.sobraDia / base.sobraDia) * 100);
      $("duelo-nota").textContent = "El sobrante por día bajó " + baja + " % en la prueba. Son " + prueba.dias +
        " días: es una señal a seguir midiendo, no una conclusión.";
    } else {
      $("duelo-nota").textContent = "";
    }

    /* Gráfico de barras agrupadas */
    var W = 900, H = 380, pl = 56, pr = 16, pt = 30, pb = 64;
    var maxV = 0;
    PRODUCTOS.forEach(function (p) { maxV = Math.max(maxV, porDiaProducto(base, p) || 0, porDiaProducto(prueba, p) || 0); });
    var techo = Math.max(1, Math.ceil(maxV * 1.2));
    var yPx = function (v) { return H - pb - (v / techo) * (H - pb - pt); };
    var ancho = (W - pl - pr) / PRODUCTOS.length;
    var g = "";
    [0, 0.5, 1].forEach(function (f) {
      var v = techo * f, y = yPx(v);
      g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="#eadfcb"/>';
      g += '<text x="' + (pl - 10) + '" y="' + (y + 5) + '" text-anchor="end" font-size="13" fill="#7a6656">' + n0(v) + '</text>';
    });
    PRODUCTOS.forEach(function (p, i) {
      var cx = pl + ancho * i + ancho / 2, bw = Math.min(56, ancho * 0.28);
      var vb = porDiaProducto(base, p) || 0, vp = porDiaProducto(prueba, p) || 0;
      var xb = cx - bw - 4, xp = cx + 4;
      g += '<g class="grupo-barra" style="--d:' + (i * 120) + 'ms">';
      g += '<rect class="barra" x="' + xb + '" y="' + yPx(vb) + '" width="' + bw + '" height="' + (H - pb - yPx(vb)) + '" rx="8" fill="#b9a58a"/>';
      g += '<rect class="barra" x="' + xp + '" y="' + yPx(vp) + '" width="' + bw + '" height="' + (H - pb - yPx(vp)) + '" rx="8" fill="#4f7d4b"/>';
      g += '<text x="' + (xb + bw / 2) + '" y="' + (yPx(vb) - 8) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#3b2a1e">' + n1(vb) + '</text>';
      g += '<text x="' + (xp + bw / 2) + '" y="' + (yPx(vp) - 8) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#3b2a1e">' + n1(vp) + '</text>';
      g += '</g>';
      g += '<text x="' + cx + '" y="' + (H - pb + 28) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#3b2a1e">' + esc(p) + '</text>';
    });
    $("grafico").innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sobrante por día y producto, línea base contra prueba">' + g + '</svg>' +
      '<div class="leyenda"><span><i class="sw" style="background:#b9a58a"></i>Línea base (19 días)</span><span><i class="sw" style="background:#4f7d4b"></i>Prueba (6 días)</span></div>';

    /* Tabla por producto */
    var filas = PRODUCTOS.map(function (p) {
      return '<tr><td>' + esc(p) + '</td><td class="n">' + n1(porDiaProducto(base, p)) + '</td><td class="n">' + n1(porDiaProducto(prueba, p)) +
        '</td><td class="n">' + base.por[p].acabo + " de " + base.dias + '</td><td class="n">' + prueba.por[p].acabo + " de " + prueba.dias + "</td></tr>";
    }).join("");
    $("tabla-producto").innerHTML = '<table class="tabla"><thead><tr><th>Producto</th><th class="n">Sobrante por día, base</th><th class="n">Sobrante por día, prueba</th><th class="n">Se acabó, base</th><th class="n">Se acabó, prueba</th></tr></thead><tbody>' + filas + "</tbody></table>";

    /* Tabla por día de la semana (solo línea base, que tiene todos los días) */
    var dias = DIAS_ORDEN.filter(function (d) {
      return datos.some(function (x) { return x.fase === "Línea base" && x.dia === d; });
    });
    var cab = dias.map(function (d) { return '<th class="n">' + d + "</th>"; }).join("");
    var cuerpo = PRODUCTOS.map(function (p) {
      var celdas = dias.map(function (d) {
        var rs = datos.filter(function (x) { return x.fase === "Línea base" && x.dia === d && x.producto === p; });
        var prom = rs.length ? rs.reduce(function (a, x) { return a + x.sobraron; }, 0) / rs.length : null;
        return '<td class="n">' + (prom == null ? '<span class="sin">—</span>' : n1(prom)) + "</td>";
      }).join("");
      return "<tr><td>" + esc(p) + "</td>" + celdas + "</tr>";
    }).join("");
    $("tabla-semana").innerHTML = '<table class="tabla"><thead><tr><th>Producto</th>' + cab + "</tr></thead><tbody>" + cuerpo + "</tbody></table>";
  }

  /* ---------- Registrar ---------- */
  function limpiarFormulario() {
    $("r-fecha").value = ""; $("r-fecha").disabled = false;
    $("r-producto").value = ""; $("r-producto").disabled = false;
    $("r-horneados").value = ""; $("r-sobraron").value = "";
    msg($("r-msg"), "");
    actualizarPrevia();
  }
  $("r-limpiar").addEventListener("click", limpiarFormulario);
  ["r-fecha", "r-producto", "r-horneados", "r-sobraron"].forEach(function (id) {
    $(id).addEventListener("input", actualizarPrevia);
    $(id).addEventListener("change", actualizarPrevia);
  });

  function leerFormulario() {
    return {
      fecha: $("r-fecha").value, producto: $("r-producto").value,
      horneados: $("r-horneados").value.trim(), sobraron: $("r-sobraron").value.trim()
    };
  }
  function errorFormulario(f) {
    if (!f.fecha) return "Elige la fecha.";
    if (f.fecha < "2026-08-11" || f.fecha > "2026-12-31") return "La fecha debe estar entre el 11 de agosto y el 31 de diciembre de 2026.";
    if (!f.producto) return "Elige el producto.";
    if (!/^\d{1,3}$/.test(f.horneados) || Number(f.horneados) > 300) return "Horneados debe ser un número entero entre 0 y 300.";
    if (!/^\d{1,3}$/.test(f.sobraron)) return "Sobraron debe ser un número entero, 0 o más.";
    if (Number(f.sobraron) > Number(f.horneados)) return "Sobraron no puede ser mayor que lo horneado.";
    return "";
  }
  function actualizarPrevia() {
    var f = leerFormulario();
    var error = (f.horneados !== "" && f.sobraron !== "") ? errorFormulario(f) : "";
    if (!f.fecha && !f.producto && f.horneados === "" && f.sobraron === "") { $("r-previa").innerHTML = ""; return; }
    if (error) { $("r-previa").innerHTML = '<p class="msg error">' + esc(error) + "</p>"; return; }
    if (f.horneados === "" || f.sobraron === "") { $("r-previa").innerHTML = ""; return; }
    var h = Number(f.horneados), s = Number(f.sobraron), v = h - s;
    var costo = s * (COSTO[f.producto] || 0);
    var fechaDia = f.fecha ? DIAS_ORDEN[(new Date(f.fecha + "T12:00:00-05:00").getDay() + 6) % 7] : "";
    $("r-previa").innerHTML =
      '<div class="chip">Fase<strong>' + (f.fecha ? esc(fase(f.fecha)) : "—") + "</strong></div>" +
      '<div class="chip">Día<strong>' + esc(fechaDia || "—") + "</strong></div>" +
      '<div class="chip">Vendidos<strong>' + v + "</strong></div>" +
      '<div class="chip ' + (s === 0 ? "acabo" : "") + '">Se acabó<strong>' + (s === 0 ? "Sí" : "No") + "</strong></div>" +
      '<div class="chip">Costo del sobrante<strong>' + cop(costo) + "</strong></div>";
  }

  $("r-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = leerFormulario();
    var err = errorFormulario(f);
    if (err) { msg($("r-msg"), err, "error"); return; }
    $("r-guardar").disabled = true; msg($("r-msg"), "Guardando…");
    enviar("guardar", { fila: { fecha: f.fecha, producto: f.producto, horneados: Number(f.horneados), sobraron: Number(f.sobraron) } }).then(function (r) {
      $("r-guardar").disabled = false;
      if (!r.ok) { msg($("r-msg"), r.error || "No se pudo guardar.", "error"); return; }
      limpiarFormulario();
      msg($("r-msg"), r.mensaje, "ok");
      cargarTodo();
    });
  });

  /* ---------- Registros ---------- */
  function pintarRegistros() {
    var rs = datos.slice().sort(function (a, b) {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      return PRODUCTOS.indexOf(a.producto) - PRODUCTOS.indexOf(b.producto);
    });
    $("g-resumen").textContent = rs.length + " registros. Editar o quitar cambia el panel.";
    $("tbody-registros").innerHTML = rs.length ? rs.map(function (d) {
      return "<tr><td>" + dmy(d.fecha) + "</td><td>" + esc(d.dia) + "</td><td>" + esc(d.producto) + '</td><td class="n">' + d.horneados +
        '</td><td class="n">' + d.sobraron + "</td><td>" + esc(d.seAcabo) +
        '</td><td><button class="btn pequeno" type="button" data-accion="editar" data-fecha="' + esc(d.fecha) + '" data-producto="' + esc(d.producto) + '">Editar</button> ' +
        '<button class="btn pequeno peligro" type="button" data-accion="quitar" data-fecha="' + esc(d.fecha) + '" data-producto="' + esc(d.producto) + '">Quitar</button></td></tr>';
    }).join("") : '<tr><td colspan="7" class="muted">Todavía no hay registros.</td></tr>';
  }
  $("tbody-registros").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-accion]");
    if (!b) return;
    var d = datos.filter(function (x) { return x.fecha === b.dataset.fecha && x.producto === b.dataset.producto; })[0];
    if (!d) return;
    if (b.dataset.accion === "editar") {
      $("r-fecha").value = d.fecha; $("r-fecha").disabled = true;
      $("r-producto").value = d.producto; $("r-producto").disabled = true;
      $("r-horneados").value = d.horneados; $("r-sobraron").value = d.sobraron;
      msg($("r-msg"), ""); mostrar("registrar");
      return;
    }
    if (!confirm("¿Quitar " + d.producto + " del " + dmy(d.fecha) + "?")) return;
    enviar("borrar", { fecha: d.fecha, producto: d.producto }).then(function (r) {
      if (!r.ok) { msg($("g-msg"), r.error || "No se pudo quitar.", "error"); return; }
      cargarTodo().then(function () { msg($("g-msg"), "Registro quitado.", "ok"); });
    });
  });
})();
