/* ========================================================================
   8. Instruments
   ======================================================================== */
const el = id => document.getElementById(id);
const put = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
const bar = (id, pct) => { const e = document.getElementById(id); if (e) e.style.width = pct + "%"; };

function instruments() {
  const m = mbit(), b = botOf(m);
  for (let i = 0; i < screenEls.length; i++) screenEls[i].classList.toggle("on", !!(m && m.screen[i]));
  const dash = "\u2014";
  const ll = b ? readLightSensor(b, "L") : 0, lr = b ? readLightSensor(b, "R") : 0;
  put("r-ll", b ? ll : dash);
  put("r-lr", b ? lr : dash);
  bar("b-ll", ll / 1023 * 100);
  bar("b-lr", lr / 1023 * 100);
  put("r-lv", m ? readScreenLight(m) : dash);
  put("r-line", b ? readLineSensor(b, "L") + " / " + readLineSensor(b, "R") : dash);
  put("r-son", b ? readSonar(b) + " cm" : dash);
  put("r-comp", m ? compassHeadingDeg(m) + "\u00b0" : dash);
  put("r-mag", m ? magneticForce(m, "x").toFixed(1) + " / " + magneticForce(m, "y").toFixed(1) +
                   " / " + magneticForce(m, "z").toFixed(0) + " \u00b5T" : dash);
  put("r-mot", b ? Math.round(b.lm) + " / " + Math.round(b.rm) : dash);
  const sp = b ? (b.vl + b.vr) / 2 : 0;
  put("r-spd", b ? Math.round(sp) + " mm/s" + (slipping ? "  slip!" : "") : dash);
  put("r-batt", b ? Math.round(b.batt) + "%" : dash);
  if (b) put("v-batt", Math.round(b.batt));
  const vS = Math.abs(sp) / 1000;
  put("r-forces", (PHYS.airOn ? PHYS.dragK * vS * vS : 0).toFixed(4) + " / " +
                  (PHYS.roll * PHYS.mass * G).toFixed(3) + " N");
  el("clock").textContent = (simTime / 1000).toFixed(1) + " s";
  put("mbName", m ? m.name : dash);
  if (m) { const e = document.getElementById("mbName"); if (e) e.style.color = m.colour; }
}

/* ---- the strip of boards and bodies, and which goes in which ---- */
function renderDevices() {
  const strip = el("devices");
  strip.innerHTML = "";
  world.mbits.forEach((m, i) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (i === world.sel ? " on" : "");
    chip.style.borderColor = m.colour;
    if (i === world.sel) chip.style.background = m.colour + "33";
    chip.innerHTML = '<i style="background:' + m.colour + '"></i>' + m.name +
                     ' <span>' + (m.kind === "bitbot" ? "robot" : "in hand") + "</span>";
    chip.addEventListener("click", () => selectDevice(i));
    strip.appendChild(chip);
  });
  el("addMbit").disabled = world.mbits.length >= MAX_MICROBITS;
  el("addBot").disabled = world.mbits.filter(m => m.kind === "bitbot").length >= MAX_BOTS;
  el("delDev").disabled = world.mbits.length <= 1;
}

function selectDevice(i) {
  if (i === world.sel) return;
  world.sel = i;
  renderDevices(); instruments(); draw();
  showProjectOf(mbit());
}

