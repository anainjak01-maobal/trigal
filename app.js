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
      $("inicio").hidden = true;
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
    $("inicio").hidden = false;
    $("titulo").textContent = "Entrar";
    msg($("acc-msg"), "");
  });

  function cargarTodo() {
    return enviar("listar").then(function (r) {
      if (!r.ok) {
        msg($("g-msg"), r.error || "No pude cargar los datos.", "error");
        $("grafico").innerHTML = '<p class="msg error">' + esc(r.error || "No pude cargar los datos.") + "</p>";
        return;
      }
      datos = (r.datos || []).map(function (d) {
        return {
          fase: d.fase, fecha: d.fecha, dia: d.dia, producto: d.producto,
          horneados: Number(d.horneados) || 0, vendidos: Number(d.vendidos) || 0,
          sobraron: Number(d.sobraron) || 0, seAcabo: d.seAcabo, costo: Number(d.costo) || 0
        };
      });
      if (r.productos && r.productos.length) {
        PRODUCTOS = r.productos.map(function (p) { return p.nombre; });
        COSTO = {};
        r.productos.forEach(function (p) { COSTO[p.nombre] = p.costo; });
        poblarProductos();
      }
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
      ["duelo", "tabla-producto", "tabla-semana", "estadistica"].forEach(function (id) { $(id).innerHTML = ""; });
      $("grafico").innerHTML = '<p class="muted">Todavía no hay registros. Revisa que la hoja tenga una pestaña llamada "Diario" con los datos iniciales.</p>';
      $("duelo-nota").textContent = "";
      return;
    }
    var base = resumen("Línea base"), prueba = resumen("Prueba");
    $("dias-base").textContent = base.dias;
    $("dias-prueba").textContent = prueba.dias;

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
      '<div class="leyenda"><span><i class="sw" style="background:#b9a58a"></i>Línea base (' + base.dias + ' días)</span><span><i class="sw" style="background:#4f7d4b"></i>Prueba (' + prueba.dias + ' días)</span></div>';

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
    pintarEstadistica();
  }


  /* ---------- Estadística ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function mediaArr(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function desvArr(a) {
    if (a.length < 2) return null;
    var m = mediaArr(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }
  function medianaArr(a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }
  function cuantil(b, q) {
    var pos = (b.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return b[lo] + (b[hi] - b[lo]) * (pos - lo);
  }
  function intervaloBoot(a, B, r) {
    var m = [];
    for (var i = 0; i < B; i++) {
      var s = 0;
      for (var j = 0; j < a.length; j++) s += a[Math.floor(r() * a.length)];
      m.push(s / a.length);
    }
    m.sort(function (x, y) { return x - y; });
    return [cuantil(m, 0.025), cuantil(m, 0.975)];
  }
  function difBoot(a, b, B, r) {
    var m = [];
    for (var i = 0; i < B; i++) {
      var sa = 0, sb = 0, j;
      for (j = 0; j < a.length; j++) sa += a[Math.floor(r() * a.length)];
      for (j = 0; j < b.length; j++) sb += b[Math.floor(r() * b.length)];
      m.push(sa / a.length - sb / b.length);
    }
    m.sort(function (x, y) { return x - y; });
    return [cuantil(m, 0.025), cuantil(m, 0.975)];
  }
  function pValorPermutacion(a, b, B, r) {
    var pool = a.concat(b), na = a.length, obs = mediaArr(a) - mediaArr(b), cont = 0;
    for (var i = 0; i < B; i++) {
      for (var k = pool.length - 1; k > 0; k--) {
        var j = Math.floor(r() * (k + 1)), t = pool[k]; pool[k] = pool[j]; pool[j] = t;
      }
      var d = mediaArr(pool.slice(0, na)) - mediaArr(pool.slice(na));
      if (Math.abs(d) >= Math.abs(obs) - 1e-12) cont++;
    }
    return (cont + 1) / (B + 1);
  }
  function wilson(k, n) {
    if (!n) return null;
    var z = 1.96, p = k / n, z2 = z * z, den = 1 + z2 / n;
    var c = (p + z2 / (2 * n)) / den, m = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
    return [Math.max(0, c - m), Math.min(1, c + m)];
  }
  function pct(x) { return x == null ? "—" : Math.round(x * 100) + " %"; }
  function rangoPct(w) { return w ? pct(w[0]) + " a " + pct(w[1]) : "—"; }
  function rangoN1(w) { return w ? n1(w[0]) + " a " + n1(w[1]) : "—"; }

  function totalesDiarios(f) {
    var m = {};
    datos.forEach(function (d) { if (d.fase === f) m[d.fecha] = (m[d.fecha] || 0) + d.sobraron; });
    return Object.keys(m).sort().map(function (k) { return m[k]; });
  }
  function diasConAgotado(f) {
    var m = {};
    datos.forEach(function (d) {
      if (d.fase !== f) return;
      if (!m.hasOwnProperty(d.fecha)) m[d.fecha] = false;
      if (d.seAcabo === "Sí") m[d.fecha] = true;
    });
    var ks = Object.keys(m);
    return { k: ks.filter(function (x) { return m[x]; }).length, n: ks.length };
  }

  function pintarEstadistica() {
    var cont = $("estadistica");
    if (!datos.length) { cont.innerHTML = ""; return; }
    var r = rng(42), B = 4000;
    var base = totalesDiarios("Línea base"), prueba = totalesDiarios("Prueba");
    var tarjetas = "", tabla = "", calidad = [];

    if (base.length >= 2 && prueba.length >= 2) {
      var dif = mediaArr(base) - mediaArr(prueba);
      var ciDif = difBoot(base, prueba, B, r);
      var p = pValorPermutacion(base, prueba, B, r);
      var veredicto = p < 0.05
        ? "Poco probable que sea azar, aunque con " + prueba.length + " días sigue siendo una señal a seguir midiendo."
        : "No se puede descartar el azar: con estos días, la diferencia podría no ser real.";
      tarjetas += '<article class="stat"><h3>¿La diferencia es real?</h3>' +
        '<p class="big">' + n1(dif) + '</p>' +
        '<p>Unidades menos por día en la prueba. Intervalo del 95 %: ' + rangoN1(ciDif) + ".</p>" +
        '<p>Valor p: ' + p.toFixed(3).replace(".", ",") + ". " + veredicto + "</p></article>";
    }
    var ib = base.length >= 2 ? intervaloBoot(base, B, r) : null;
    var ip = prueba.length >= 2 ? intervaloBoot(prueba, B, r) : null;
    tarjetas += '<article class="stat"><h3>Rango del promedio diario</h3>' +
      '<p>Línea base: <strong>' + n1(mediaArr(base)) + "</strong> (95 %: " + rangoN1(ib) + ").</p>" +
      '<p>Prueba: <strong>' + (prueba.length ? n1(mediaArr(prueba)) : "—") + "</strong> (95 %: " + rangoN1(ip) + ").</p>" +
      '<p>Entre más días, más estrecho el rango. Con ' + prueba.length + ' días, el rango de la prueba es amplio.</p></article>';

    var dB = diasConAgotado("Línea base"), dP = diasConAgotado("Prueba");
    tarjetas += '<article class="stat"><h3>Días con algún producto agotado</h3>' +
      '<p>Línea base: <strong>' + pct(dB.n ? dB.k / dB.n : null) + "</strong> (" + dB.k + " de " + dB.n + "; 95 %: " + rangoPct(wilson(dB.k, dB.n)) + ").</p>" +
      '<p>Prueba: <strong>' + pct(dP.n ? dP.k / dP.n : null) + "</strong> (" + dP.k + " de " + dP.n + "; 95 %: " + rangoPct(wilson(dP.k, dP.n)) + ").</p>" +
      '<p>Un día agotado significa que el horno no alcanzó. No dice cuánta demanda se perdió.</p></article>';

    /* Tabla por producto */
    var filas = PRODUCTOS.map(function (p) {
      function fila(f) {
        var rs = datos.filter(function (x) { return x.fase === f && x.producto === p; });
        var sob = rs.map(function (x) { return x.sobraron; });
        var acab = rs.filter(function (x) { return x.seAcabo === "Sí"; });
        var vendAcab = acab.length ? mediaArr(acab.map(function (x) { return x.vendidos; })) : null;
        return {
          media: sob.length ? mediaArr(sob) : null,
          mediana: sob.length ? medianaArr(sob) : null,
          desv: desvArr(sob),
          agot: wilson(acab.length, rs.length),
          pAgot: rs.length ? acab.length / rs.length : null,
          demanda: vendAcab
        };
      }
      var b = fila("Línea base"), q = fila("Prueba");
      return "<tr><td>" + esc(p) + '</td><td class="n">' + n1(b.media) + '</td><td class="n">' + n1(b.mediana) + '</td><td class="n">' + n1(b.desv) +
        '</td><td class="n">' + pct(b.pAgot) + "<br><small>" + rangoPct(b.agot) + '</small></td><td class="n">' + (b.demanda == null ? "—" : "al menos " + n1(b.demanda)) +
        '</td><td class="n">' + n1(q.media) + '</td><td class="n">' + pct(q.pAgot) + "<br><small>" + rangoPct(q.agot) + "</small></td></tr>";
    }).join("");
    tabla = '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="n">Promedio, base</th><th class="n">Mediana, base</th><th class="n">Variación, base</th><th class="n">Días agotado, base</th><th class="n">Demanda en días agotados, base</th><th class="n">Promedio, prueba</th><th class="n">Días agotado, prueba</th></tr></thead><tbody>' + filas + "</tbody></table></div>";

    /* Histograma: proporción de días por rango, para comparar fases con distinto número de días */
    var todos = base.concat(prueba), maxT = todos.length ? Math.max.apply(null, todos) : 0;
    var ancho = 4, nb = Math.floor(maxT / ancho) + 1, cb = [], cp = [];
    for (var i = 0; i < nb; i++) { cb.push(0); cp.push(0); }
    base.forEach(function (v) { cb[Math.floor(v / ancho)]++; });
    prueba.forEach(function (v) { cp[Math.floor(v / ancho)]++; });
    var W = 900, H = 320, pl = 56, pr = 16, pt = 24, pb = 56, maxS = 0;
    for (i = 0; i < nb; i++) {
      maxS = Math.max(maxS, base.length ? cb[i] / base.length : 0, prueba.length ? cp[i] / prueba.length : 0);
    }
    var techo = Math.max(0.1, maxS * 1.15), anchoB = (W - pl - pr) / nb;
    var hy = function (v) { return H - pb - (v / techo) * (H - pb - pt); };
    var hg = "";
    for (i = 0; i < nb; i++) {
      var x0 = pl + i * anchoB, sb = base.length ? cb[i] / base.length : 0, sp = prueba.length ? cp[i] / prueba.length : 0;
      hg += '<rect x="' + (x0 + 6) + '" y="' + hy(sb) + '" width="' + (anchoB / 2 - 8) + '" height="' + (H - pb - hy(sb)) + '" rx="6" fill="#b9a58a"/>';
      hg += '<rect x="' + (x0 + anchoB / 2 + 2) + '" y="' + hy(sp) + '" width="' + (anchoB / 2 - 8) + '" height="' + (H - pb - hy(sp)) + '" rx="6" fill="#4f7d4b"/>';
      hg += '<text x="' + (x0 + anchoB / 2) + '" y="' + (H - pb + 22) + '" text-anchor="middle" font-size="13" fill="#7a6656">' + (i * ancho) + "–" + (i * ancho + ancho) + "</text>";
    }
    [0, 0.5, 1].forEach(function (f) {
      var v = techo * f;
      hg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + hy(v) + '" y2="' + hy(v) + '" stroke="#eadfcb"/>';
      hg += '<text x="' + (pl - 8) + '" y="' + (hy(v) + 5) + '" text-anchor="end" font-size="13" fill="#7a6656">' + Math.round(v * 100) + " %</text>";
    });
    var histo = '<div class="panel tarjeta-grafico"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Distribución del sobrante diario">' + hg + "</svg>" +
      '<div class="leyenda"><span><i class="sw" style="background:#b9a58a"></i>Línea base: % de sus ' + base.length + ' días</span><span><i class="sw" style="background:#4f7d4b"></i>Prueba: % de sus ' + prueba.length + ' días</span></div></div>';

    /* Calidad de datos */
    var claves = {}, dup = 0, excede = 0, lunesPrueba = 0;
    datos.forEach(function (d) {
      var k = d.fecha + "|" + d.producto;
      if (claves[k]) dup++; else claves[k] = true;
      if (d.sobraron > d.horneados) excede++;
      if (d.fase === "Prueba" && d.dia === "Lunes") lunesPrueba++;
    });
    calidad.push(datos.length + " registros: " + base.length + " días de línea base y " + prueba.length + " de prueba.");
    calidad.push(dup ? dup + " registros repetidos (misma fecha y producto)." : "Sin registros repetidos.");
    calidad.push(excede ? excede + " registros con más sobrante que horneado: revisar." : "Ningún registro tiene más sobrante que horneado.");
    calidad.push(lunesPrueba ? lunesPrueba + " lunes en la prueba." : "La prueba no tiene lunes: no se compara ese día con la línea base.");

    cont.innerHTML =
      '<div class="stat-grid">' + tarjetas + "</div>" +
      '<h3 class="sub">Por producto</h3>' + tabla +
      '<h3 class="sub">Cómo se reparten los días según el sobrante</h3>' + histo +
      '<h3 class="sub">Calidad de los datos</h3><ul class="limites">' + calidad.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" +
      '<h3 class="sub">Cómo leer estos números</h3><ul class="limites">' +
      "<li><strong>Intervalo del 95 %:</strong> el rango donde probablemente está el valor real. Si es ancho, el dato es poco preciso.</li>" +
      "<li><strong>Valor p:</strong> qué tan probable es ver una diferencia así si en realidad no hubiera diferencia. Menos de 0,05 suele considerarse una señal fuerte.</li>" +
      "<li><strong>Demanda en días agotados:</strong> es un mínimo. Si el horno se acabó, las personas pudieron querer más de lo que se vendió.</li>" +
      "<li><strong>Histograma en porcentaje:</strong> las fases tienen distinto número de días, así que se comparan proporciones, no conteos.</li>" +
      "</ul>";
  }

  /* ---------- Registrar ---------- */
  function poblarProductos() {
    var sel = $("r-producto"), actual = sel.value;
    sel.innerHTML = '<option value="">Elige</option>' + PRODUCTOS.map(function (p) { return "<option>" + esc(p) + "</option>"; }).join("");
    if (PRODUCTOS.indexOf(actual) >= 0) sel.value = actual;
  }
  poblarProductos();

  $("p-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var nombre = $("p-nombre").value.trim(), costo = $("p-costo").value.trim();
    if (!nombre) { msg($("p-msg"), "Escribe el nombre del producto.", "error"); return; }
    if (!/^\d{1,6}$/.test(costo)) { msg($("p-msg"), "El costo debe ser un número entero, sin puntos ni comas.", "error"); return; }
    $("p-guardar").disabled = true; msg($("p-msg"), "Agregando…");
    enviar("producto", { nombre: nombre, costo: Number(costo) }).then(function (r) {
      $("p-guardar").disabled = false;
      if (!r.ok) { msg($("p-msg"), r.error || "No se pudo agregar.", "error"); return; }
      $("p-nombre").value = ""; $("p-costo").value = "";
      msg($("p-msg"), r.mensaje || "Producto agregado.", "ok");
      cargarTodo();
    });
  });

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
