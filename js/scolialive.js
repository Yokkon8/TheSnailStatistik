// Live-Anbindung an die Scolia-API (Personal Plan, WebSocket).
// Die API liefert nur rohe Wurf-Ereignisse in Echtzeit – kein 180er, kein
// Finish, keine Historie. Diese Datei rechnet aus den Würfen ein Solo-X01-Leg
// mit und erkennt daraus 180er, High Finishes und Short Legs.
//
// Wichtig: funktioniert für SOLO-Training (nur du wirfst am Board). Bei
// Spielen zu zweit sieht die API beide Spieler und kann nicht zuordnen.

// Punktwert eines geworfenen Feldes: "T20"→60, "D16"→32, "S5"/"s5"→5,
// "25"→25, "Bull"→50, "None"→0.
export function sectorValue(sector) {
  if (!sector || sector === "None") return 0;
  if (sector === "Bull") return 50;
  if (sector === "25") return 25;
  const m = sector.match(/^([SsDT])(\d{1,2})$/);
  if (!m) return 0;
  const n = Number(m[2]);
  const mult = m[1] === "T" ? 3 : m[1] === "D" ? 2 : 1;
  return n * mult;
}

// Zählt als Doppel fürs Checkout (Doppel-Feld oder Bull).
export function isDoubleSector(sector) {
  return sector === "Bull" || /^D\d{1,2}$/.test(sector);
}

// X01-Rechner für ein Solo-Leg. Meldet Ereignisse zurück:
//   { kind: "highscore", score }   – 180er oder 171+ in einer Runde
//   { kind: "legWon", darts, checkout } – Leg gewonnen
//   { kind: "bust" }               – überworfen
export function createX01(config = {}) {
  const startScore = config.startScore ?? 501;
  const doubleOut = config.doubleOut ?? true;

  let remaining = startScore; // Rest zu Beginn der aktuellen Runde
  let dartsThisLeg = 0;
  let turn = []; // Würfe der laufenden Runde: [{ value, double }]
  let phase = "playing"; // playing | turnDone | won | bust

  const turnScore = () => turn.reduce((s, t) => s + t.value, 0);

  function startTurn() {
    turn = [];
    phase = "playing";
  }
  function startLeg() {
    remaining = startScore;
    dartsThisLeg = 0;
    startTurn();
  }

  function throwDart(sector) {
    const events = [];
    if (phase !== "playing") return events; // auf Takeout warten
    const value = sectorValue(sector);
    const double = isDoubleSector(sector);
    turn.push({ value, double });
    dartsThisLeg++;
    const rs = turnScore();
    const tentative = remaining - rs;

    if (tentative === 0 && double) {
      phase = "won";
      events.push({ kind: "legWon", darts: dartsThisLeg, checkout: remaining });
    } else if (tentative < 0 || (tentative === 0 && !double) || (doubleOut && tentative === 1)) {
      phase = "bust";
      events.push({ kind: "bust", remaining });
    } else if (turn.length >= 3) {
      phase = "turnDone";
      remaining = tentative;
    }

    // 180er / 171+ werden über die volle 3-Dart-Runde erkannt (auch bei Bust)
    if (turn.length === 3 && rs >= 171 && phase !== "won") {
      events.push({ kind: "highscore", score: rs });
    }
    return events;
  }

  // Rundenende durch Takeout (Darts vom Board genommen)
  function endTurn() {
    if (phase === "won") {
      startLeg();
    } else if (phase === "playing") {
      // vorzeitig herausgenommen: verbleibende Punkte verbuchen
      remaining = remaining - turnScore();
      startTurn();
    } else {
      // turnDone (schon verbucht) oder bust (unverändert)
      startTurn();
    }
    return [];
  }

  return {
    throwDart,
    endTurn,
    startLeg,
    state: () => ({ remaining, dartsThisLeg, startScore, phase }),
  };
}

// WebSocket-Steuerung. handlers: onStatus, onBoard, onThrow, onEngine.
export function createLiveController(handlers = {}) {
  let ws = null;
  let engine = null;

  function handleThrow(payload) {
    handlers.onThrow?.(payload);
    const sector = payload.bounceout ? "None" : payload.sector;
    const events = engine ? engine.throwDart(sector) : [];
    handlers.onEngine?.(events, engine?.state());
  }
  function handleTakeout() {
    if (engine) engine.endTurn();
    handlers.onEngine?.([], engine?.state());
  }

  function handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "HELLO_CLIENT":
      case "SBC_STATUS":
      case "SBC_STATUS_CHANGED":
        handlers.onBoard?.(msg.payload || {});
        break;
      case "THROW_DETECTED":
        handleThrow(msg.payload || {});
        break;
      case "TAKEOUT_FINISHED":
        if (!msg.payload?.falseTakeout) handleTakeout();
        break;
    }
  }

  return {
    connect(serial, token, gameConfig) {
      engine = createX01(gameConfig);
      const url =
        "wss://game.scoliadarts.com/api/v1/social?serialNumber=" +
        encodeURIComponent(serial) +
        "&accessToken=" +
        encodeURIComponent(token);
      try {
        ws = new WebSocket(url);
      } catch (e) {
        handlers.onStatus?.("fehler", e.message);
        return;
      }
      ws.onopen = () => handlers.onStatus?.("verbunden");
      ws.onclose = (e) => handlers.onStatus?.("getrennt", e.code);
      ws.onerror = () => handlers.onStatus?.("fehler");
      ws.onmessage = (ev) => handleMessage(ev.data);
    },
    disconnect() {
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      handlers.onStatus?.("getrennt");
    },
    isConnected: () => !!ws && ws.readyState === WebSocket.OPEN,
    newLeg(gameConfig) {
      engine = createX01(gameConfig);
      handlers.onEngine?.([], engine.state());
    },
    engineState: () => engine?.state(),

    // Simulation ohne Board – speist Ereignisse durch dieselbe Verarbeitung
    simThrow(sector) {
      handleThrow({ sector, bounceout: false });
    },
    simTakeout() {
      handleTakeout();
    },
    ensureEngine(gameConfig) {
      if (!engine) engine = createX01(gameConfig);
    },
  };
}
