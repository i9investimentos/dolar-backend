import express from "express";
import { WebSocketServer } from "ws";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
import cors from "cors";
import http from "http";

// ===============================================
//  TICKERS DO YAHOO FINANCE
//  Esses são os códigos exatos que o Yahoo usa.
//  Não tem WDO direto — USDBRL=X é o proxy do dólar futuro.
// ===============================================
const TICKERS = {
  DXY:    "DX-Y.NYB",  // Dollar Index
  US10Y:  "^TNX",      // Treasury 10 anos
  WTI:    "CL=F",      // Petróleo WTI futuro
  BRENT:  "BZ=F",      // Petróleo Brent futuro
  USDMXN: "USDMXN=X",  // Peso mexicano
  USDZAR: "USDZAR=X",  // Rand sul-africano
  USDBRL: "USDBRL=X",  // Dólar à vista (proxy do WDO)
  VIX:    "^VIX",      // Índice de volatilidade
  GOLD:   "GC=F",      // Ouro futuro
  US500:  "^GSPC",     // S&P 500
};

const app = express();
app.use(cors());

// rota simples pra confirmar que tá no ar
app.get("/health", (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// quantos clientes estão conectados
wss.on("connection", (ws) => {
  console.log(`✅ cliente conectado — total: ${wss.clients.size}`);
  ws.on("close", () => console.log(`❌ cliente desconectou — total: ${wss.clients.size}`));
});

// busca os preços no Yahoo
async function snapshot() {
  const out = {};
  await Promise.all(
    Object.entries(TICKERS).map(async ([key, sym]) => {
      try {
        const q = await yahooFinance.quote(sym);
        out[key] = {
          px: q.regularMarketPrice ?? null,
          chg: q.regularMarketChangePercent ?? null,
        };
      } catch (e) {
        console.error(`erro buscando ${key} (${sym}):`, e.message);
      }
    })
  );
  return out;
}

// envia a cada 5 segundos pra todos os clientes conectados
async function broadcast() {
  if (wss.clients.size === 0) return; // sem clientes, não busca nada
  try {
    const data = await snapshot();
    const msg = JSON.stringify({ type: "macro", data, ts: Date.now() });
    let sent = 0;
    wss.clients.forEach((c) => {
      if (c.readyState === 1) {
        c.send(msg);
        sent++;
      }
    });
    console.log(`📡 enviado pra ${sent} cliente(s) • ${Object.keys(data).length} ativos`);
  } catch (e) {
    console.error("erro no broadcast:", e.message);
  }
}

setInterval(broadcast, 5000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 backend rodando em http://localhost:${PORT}`);
  console.log(`   WebSocket em ws://localhost:${PORT}`);
  console.log(`   health check em http://localhost:${PORT}/health`);
});
