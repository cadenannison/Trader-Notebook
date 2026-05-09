// ═══════════════════════════════════════════════════════
// DATA LAYER
// ═══════════════════════════════════════════════════════
let userName      = localStorage.getItem('tn-name');
let alerts        = JSON.parse(localStorage.getItem('tn-alerts') || '[]');
let trades        = JSON.parse(localStorage.getItem('tn-trades') || '[]');
let pendingLog    = null;
let pendingClose  = null;
let geminiKey     = localStorage.getItem('tn-gemini-key')  || 'AIzaSyC7ulwjzPRn3I2IC2qWmr38kJ2mLcFFQQg';
let finnhubKey    = localStorage.getItem('tn-finnhub-key') || 'd7o4p61r01qmqe7i2ct0d7o4p61r01qmqe7i2ctg';
let chatHistory   = [];
let chatLog       = JSON.parse(sessionStorage.getItem('tn-chat-log') || '[]');
let allNewsItems  = [];
let newsFilterTicker = 'ALL';
let lastNewsFetch = 0;
let tickerPrices  = {};

function saveAlerts() { localStorage.setItem('tn-alerts', JSON.stringify(alerts)); }
function saveTrades() { localStorage.setItem('tn-trades', JSON.stringify(trades)); }

// ═══════════════════════════════════════════════════════
// COMPANY NAME → TICKER MAP
// ═══════════════════════════════════════════════════════
const NAME_MAP = {
  palantir: 'PLTR', apple: 'AAPL', tesla: 'TSLA', nvidia: 'NVDA',
  meta: 'META', amazon: 'AMZN', microsoft: 'MSFT', google: 'GOOGL',
  alphabet: 'GOOGL', amd: 'AMD', coinbase: 'COIN', netflix: 'NFLX',
  'advanced micro': 'AMD', 'advanced micro devices': 'AMD',
};

// ═══════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
function switchView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = document.getElementById('view-' + id);
  if (view) view.classList.add('active');
  const btn = document.querySelector(`[data-view="${id}"]`);
  if (btn) btn.classList.add('active');

  if (id === 'notebook') renderNotebook();
  if (id === 'settings') renderSettings();
  if (id === 'news')     loadNews(false);
  if (id === 'stats')    renderStats();
  if (id === 'alerts') {
    renderAlerts();
    if (finnhubKey && alerts.filter(a => a.status === 'active' || a.status === 'triggered').length
        && !Object.keys(tickerPrices).length)
      setTimeout(checkPrices, 400);
  }
}

function toggleTgStats(ticker, btn) {
  const wrap = document.getElementById('stats-' + ticker);
  if (!wrap) return;
  const collapsed = wrap.classList.toggle('tg-collapsed');
  btn.classList.toggle('open', !collapsed);
  if (!collapsed) renderTickerStats(ticker, alerts.filter(a => a.ticker === ticker && (a.status === 'active' || a.status === 'triggered')), tickerPrices[ticker]);
}

function digDeeperNews(prompt) {
  switchView('chat');
  // give the view one frame to become visible before filling + sending
  requestAnimationFrame(() => {
    fillInput(prompt);
    sendMessage();
  });
}

// ═══════════════════════════════════════════════════════
// CHAT ENGINE
// ═══════════════════════════════════════════════════════
const chatInner  = document.getElementById('chat-inner');
const chatScroll = document.getElementById('chat-scroll');
const chatTa     = document.getElementById('chat-ta');
const viewChat   = document.getElementById('view-chat');

function removeWelcome() { viewChat.classList.add('has-messages'); }

function startNewChat() {
  chatInner.innerHTML = '';
  chatHistory = [];
  chatLog     = [];
  sessionStorage.removeItem('tn-chat-log');
  viewChat.classList.remove('has-messages');
  switchView('chat');
  const greetingEl = document.getElementById('landing-greeting');
  const subEl      = document.getElementById('landing-sub');
  if (greetingEl) {
    greetingEl.textContent = userName ? `Welcome back, ${userName}` : 'tradrNotebook';
  }
  if (subEl) refreshLandingContent();
}

function addMsg(text, role, html = false) {
  removeWelcome();
  const group  = document.createElement('div');
  group.className = 'msg-group';
  const row    = document.createElement('div');
  row.className = 'msg-row ' + role;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ' + role;
  if (html) bubble.innerHTML = text;
  else bubble.textContent = text;
  row.appendChild(bubble);
  group.appendChild(row);
  chatInner.appendChild(group);
  chatScroll.scrollTop = chatScroll.scrollHeight;

  chatLog.push({ text, role, html });
  try { sessionStorage.setItem('tn-chat-log', JSON.stringify(chatLog)); } catch(_) {}
}

function showTyping() {
  removeWelcome();
  const group  = document.createElement('div');
  group.className = 'msg-group';
  group.id = 'typing-indicator';
  const row    = document.createElement('div');
  row.className = 'msg-row ai';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ai typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  row.appendChild(bubble);
  group.appendChild(row);
  chatInner.appendChild(group);
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

function sendMessage() {
  const text = chatTa.value.trim();
  if (!text) return;
  chatTa.value = '';
  chatTa.style.height = 'auto';
  addMsg(text, 'user');
  handleInput(text);
}

function fillInput(text) {
  chatTa.value = text;
  chatTa.focus();
  chatTa.style.height = 'auto';
  chatTa.style.height = Math.min(chatTa.scrollHeight, 160) + 'px';
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
chatTa.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
chatTa.addEventListener('input', () => {
  chatTa.style.height = 'auto';
  chatTa.style.height = Math.min(chatTa.scrollHeight, 160) + 'px';
});

// ═══════════════════════════════════════════════════════
// GEMINI AI ENGINE
// ═══════════════════════════════════════════════════════
function buildSystemPrompt() {
  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'triggered');
  const closedTrades = trades.filter(t => t.exitPrice != null);

  const alertsText = activeAlerts.length
    ? activeAlerts.map(a =>
        `  - ${a.ticker} ${a.condition} $${a.price.toFixed(2)}${a.note ? ` ("${a.note}")` : ''} [${a.status}]`
      ).join('\n')
    : '  None';

  const tradesText = closedTrades.length
    ? closedTrades.slice(-8).map(t =>
        `  - ${t.ticker}: entry $${t.entryPrice}, exit $${t.exitPrice}, return ${t.returnPct > 0 ? '+' : ''}${t.returnPct}%`
      ).join('\n')
    : '  None';

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return [
    `You are a sharp, professional AI trading assistant inside TradrNotebook — a personal trading journal app. You help traders set price alerts, journal their thinking, and build self-awareness about their patterns.`,
    ``,
    `USER: ${userName || 'Trader'}`,
    `DATE: ${today}`,
    ``,
    `ACTIVE ALERTS:`,
    alertsText,
    ``,
    `RECENT CLOSED TRADES:`,
    tradesText,
    ``,
    `YOUR ROLE:`,
    `- Help the user set price alerts across all formats (exact price, % move, $ move, moving averages)`,
    `- Always capture WHY the trader wants each alert — this is the most important data point`,
    `- Reference their actual alerts and trade history when relevant`,
    `- Be concise and direct, like a sharp trading desk colleague`,
    `- Never guarantee outcomes — frame everything as probabilistic analysis`,
    ``,
    `ALERT TYPES:`,
    `1. Exact price: {"message":"...","action":{"type":"add_alert","ticker":"NVDA","condition":"below","price":800,"note":"reason"}}`,
    `2. Percentage move: {"message":"...","action":{"type":"fetch_and_alert","ticker":"TSLA","condition":"below","pctMove":5,"note":"reason"}}`,
    `3. Dollar move: {"message":"...","action":{"type":"fetch_and_alert","ticker":"AMZN","condition":"below","dollarMove":20,"note":"reason"}}`,
    `4. Moving average: {"message":"...","action":{"type":"fetch_ma_alert","ticker":"NVDA","condition":"below","maPeriod":200,"note":"reason"}}`,
    `5. Navigate: {"message":"...","action":{"type":"show_view","view":"alerts"}}`,
    `   Valid views: alerts, notebook, news, stats`,
    `6. Update last alert note: {"message":"Got it, noted.","action":{"type":"update_last_alert_note","note":"their reasoning"}}`,
    ``,
    `THE "WHY" RULE — CRITICAL:`,
    `Every alert needs a reason. After setting any alert, always ask why in the same message — even in batch mode. Be specific to the ticker and price level: e.g. "SYNA alert set. What's the thesis here — support break, sector play, or something else?" Vary phrasing each time. When they answer, use update_last_alert_note to capture it, then immediately move to the next ticker in the batch.`,
    ``,
    `MULTI-LEVEL ALERTS (same ticker, different prices):`,
    `When a user gives multiple price points for the same ticker, treat each as a separate alert with its own distinct reason. Set them one at a time. For each level ask what it specifically represents: "Is $750 your initial support test, or are you sizing into a deeper flush?" The note for each level should capture that level's specific thesis. If you detect a layered structure, name it: "looks like you're building a tiered entry."`,
    ``,
    `BATCH WATCHLIST RULE — strict one-action-per-message architecture:`,
    `You can only execute ONE action per response. When given a list of tickers:`,
    `- Set the first ticker's 5%-drop alert (fetch_and_alert, pctMove: 5, condition: below) unless told otherwise.`,
    `- In that same message, ask WHY the user is watching that specific name.`,
    `- When they reply: capture the note with update_last_alert_note, then set the next ticker + ask why.`,
    `- Repeat until list is complete. End with: "All [N] alerts set. Check the Alerts tab."`,
    `- Keep each message to 1-2 sentences. Never narrate your plan or describe the full list.`,
    ``,
    `RESPONSE FORMAT — always return a single valid JSON object, nothing else:`,
    `{"message":"plain text response, max 80 words","action":null}`,
    `Condition must be exactly "above" or "below". Ticker must be uppercase.`,
  ].join('\n');
}

// Models tried in order until one succeeds. Cached in localStorage once found.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-latest',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.5-flash-preview',
  'gemini-2.0-flash',
  'gemini-2.0-flash-latest',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-lite',
];
let _activeModel = null;

async function _tryModel(model, userMessage, history, systemPrompt) {
  // Try v1beta first (preview models), then v1 (stable GA models)
  const urls = [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`,
  ];
  let lastNotFound;
  for (const url of urls) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!resp.ok) {
      const err  = await resp.json().catch(() => ({}));
      const msg  = err?.error?.message || `HTTP ${resp.status}`;
      const notFound = resp.status === 404 || /not found/i.test(msg);
      const quota    = resp.status === 429 || /quota exceeded/i.test(msg);
      if (notFound) { lastNotFound = Object.assign(new Error(msg), { skip: true }); continue; }
      throw Object.assign(new Error(msg), { skip: quota });
    }
    const data = await resp.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return { parsed: extractJSON(raw), raw };
  }
  throw lastNotFound;
}

async function callGemini(userMessage) {
  const history      = chatHistory.slice(-10).map(h => ({ role: h.role, parts: [{ text: h.text }] }));
  const systemPrompt = buildSystemPrompt();

  const ordered = _activeModel
    ? [_activeModel, ...GEMINI_MODELS.filter(m => m !== _activeModel)]
    : GEMINI_MODELS;

  let lastErr;
  for (const model of ordered) {
    try {
      const result = await _tryModel(model, userMessage, history, systemPrompt);
      if (model !== _activeModel) {
        _activeModel = model;
        localStorage.setItem('tn-gemini-model', model);
        console.log('Gemini: using', model);
      }
      return result;
    } catch(e) {
      lastErr = e;
      if (e.skip) continue; // not found or quota — try next model
      throw e;              // auth / network — surface immediately
    }
  }
  throw new Error('No Gemini model available — all models returned quota or not-found errors. Try again tomorrow or check your API key.');
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch(_) {}
  const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
  try { return JSON.parse(stripped); } catch(_) {}
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(stripped.slice(start, end + 1)); } catch(_) {}
  }
  return { message: stripped || text, action: null };
}

async function handleInput(raw) {
  if (!geminiKey) { handleInputFallback(raw); return; }

  showTyping();
  try {
    const { parsed, raw: modelRaw } = await callGemini(raw);
    removeTyping();

    const message = parsed.message || '';
    if (message) addMsg(message, 'ai');

    chatHistory.push({ role: 'user',  text: raw });
    chatHistory.push({ role: 'model', text: modelRaw });

    const action = parsed.action;
    if (action?.type === 'add_alert' && action.ticker && action.condition && action.price) {
      createAlertFromAction(action, raw);

    } else if (action?.type === 'fetch_and_alert' && action.ticker && action.condition) {
      try {
        const q = await fetchQuote(action.ticker.toUpperCase());
        if (!q.c) throw new Error('No price returned');
        let target;
        if (action.pctMove)
          target = action.condition === 'below'
            ? q.c * (1 - action.pctMove / 100)
            : q.c * (1 + action.pctMove / 100);
        else if (action.dollarMove)
          target = action.condition === 'below'
            ? q.c - action.dollarMove
            : q.c + action.dollarMove;
        target = parseFloat(target.toFixed(2));
        createAlertFromAction({ ...action, price: target }, raw);
        const moveDesc = action.pctMove
          ? `${action.pctMove}% ${action.condition === 'below' ? 'below' : 'above'}`
          : `$${action.dollarMove} ${action.condition === 'below' ? 'below' : 'above'}`;
        addMsg(`Alert set at $${target} — that's ${moveDesc} the current price of $${q.c.toFixed(2)}.`, 'ai');
      } catch(e) {
        addMsg(`I need a live price to calculate that move. Check your Finnhub key in Settings and try again.`, 'ai');
      }

    } else if (action?.type === 'fetch_ma_alert' && action.ticker && action.condition && action.maPeriod) {
      try {
        const maValue = await fetchMovingAverage(action.ticker.toUpperCase(), action.maPeriod);
        const noteText = `${action.maPeriod}-day MA${action.note ? ' — ' + action.note : ''}`;
        createAlertFromAction({ ...action, price: maValue, note: noteText }, raw);
        addMsg(`Alert set at $${maValue.toFixed(2)} — the current ${action.maPeriod}-day MA for ${action.ticker.toUpperCase()}.`, 'ai');
      } catch(e) {
        addMsg(`Couldn't fetch the ${action.maPeriod}-day MA for ${action.ticker} (${e.message}).`, 'ai');
      }

    } else if (action?.type === 'update_last_alert_note' && action.note) {
      const lastAlert = [...alerts].reverse().find(a => a.status === 'active' || a.status === 'triggered');
      if (lastAlert) { lastAlert.note = action.note; saveAlerts(); }

    } else if (action?.type === 'show_view' && action.view) {
      setTimeout(() => switchView(action.view), 350);
    }

  } catch(e) {
    removeTyping();
    console.error('Gemini error:', e);
    addMsg(`Couldn't reach the AI right now (${e.message}). Check your Google AI key in Settings.`, 'ai');
  }
}

function handleInputFallback(raw) {
  const t = raw.toLowerCase();
  if (/\b(stats|performance|history|how.*(i|my).*doing|success rate|win rate)\b/.test(t)) {
    const closed = trades.filter(x => x.exitPrice != null);
    if (!closed.length) {
      addMsg("You haven't logged any completed trades yet. When an alert triggers I'll prompt you to log the trade.", 'ai');
    } else {
      const wins = closed.filter(x => x.returnPct > 0).length;
      const wr   = Math.round(wins / closed.length * 100);
      const avg  = (closed.reduce((s, x) => s + x.returnPct, 0) / closed.length).toFixed(1);
      addMsg(`📊 ${closed.length} trades logged — ${wr}% win rate, ${avg > 0 ? '+' : ''}${avg}% avg return. Open Stats for full analysis.`, 'ai');
    }
    return;
  }
  if (/\b(show|what|list|my).*(alert|watch|track)/.test(t)) {
    const active = alerts.filter(a => a.status === 'active');
    if (!active.length) {
      addMsg("You have no active alerts right now. Set one — e.g. \"Alert me when AAPL drops below $170\"", 'ai');
    } else {
      const lines = active.map(a => `• ${a.ticker} ${a.condition === 'below' ? '↓ below' : '↑ above'} $${a.price.toFixed(2)}${a.note ? ` — "${a.note}"` : ''}`).join('\n');
      addMsg(`${active.length} active alert${active.length > 1 ? 's' : ''}:\n\n${lines}`, 'ai');
    }
    return;
  }
  addMsg("I need a Google AI key to understand that. Add it in Settings, or try \"Alert me when NVDA drops below $800\".", 'ai');
}

// ═══════════════════════════════════════════════════════
// CREATE ALERT
// ═══════════════════════════════════════════════════════
function createAlertFromAction(action, rawText) {
  const al = {
    id:             Date.now(),
    ticker:         action.ticker.toUpperCase(),
    condition:      action.condition,
    price:          parseFloat(action.price),
    note:           action.note || '',
    raw:            rawText,
    addedAt:        new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    status:         'active',
    triggeredAt:    null,
    triggeredPrice: null,
  };
  alerts.push(al);
  saveAlerts();
  return al;
}

// ═══════════════════════════════════════════════════════
// REAL-TIME ALERT CHECKING
// ═══════════════════════════════════════════════════════
async function checkAndTriggerAlerts() {
  const liveToggle = document.getElementById('toggle-live');
  if (liveToggle && !liveToggle.checked) return;

  const active = alerts.filter(a => a.status === 'active');
  if (!active.length || !finnhubKey) return;

  const tickers = [...new Set(active.map(a => a.ticker))];
  try {
    const results = await Promise.all(tickers.map(async t => {
      const q = await fetchQuote(t);
      return [t, q];
    }));
    results.forEach(([t, q]) => { if (q?.c) tickerPrices[t] = { c: q.c, pc: q.pc, h: q.h, l: q.l }; });

    const priceMap = Object.fromEntries(results);
    active.forEach(al => {
      const price = priceMap[al.ticker]?.c;
      if (!price) return;
      const hit = (al.condition === 'below' && price <= al.price) ||
                  (al.condition === 'above' && price >= al.price);
      if (hit) {
        al.status         = 'triggered';
        al.triggeredAt    = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        al.triggeredPrice = parseFloat(price.toFixed(2));
        saveAlerts();
        notifyAlertTriggered(al, price);
      }
    });

    if (document.getElementById('view-alerts').classList.contains('active')) renderAlerts();
  } catch(e) { console.warn('Alert check error:', e.message); }
}

function notifyAlertTriggered(al, price) {
  const notify = document.getElementById('toggle-notify');
  if (notify && !notify.checked) return;

  if (!viewChat.classList.contains('active')) switchView('chat');

  const condText = al.condition === 'below' ? 'dropped below' : 'rose above';
  const noteText = al.note ? `\n\nYour thesis: "${al.note}"` : '';
  addMsg(
    `🔔 Alert Triggered — ${al.ticker} has ${condText} $${al.price.toFixed(2)}.\n\nLive price: $${price.toFixed(2)}${noteText}\n\nReady to act on this?`,
    'ai'
  );

  const group = document.createElement('div');
  group.className = 'msg-group';
  group.innerHTML = `
    <div class="msg-row ai">
      <div class="chat-alert-actions">
        <button class="btn btn-primary" onclick="openLogModal(${al.id})">Log Trade</button>
        <button class="btn btn-ghost" onclick="dismissAlert(${al.id}, this)">Dismiss</button>
      </div>
    </div>`;
  chatInner.appendChild(group);
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

// ═══════════════════════════════════════════════════════
// TRADE LOGGING MODAL
// ═══════════════════════════════════════════════════════
function openLogModal(alertId) {
  pendingLog   = alertId;
  pendingClose = null;
  const al = alerts.find(a => a.id === alertId);
  document.getElementById('modal-title').textContent = `Log Trade — ${al ? al.ticker : ''}`;
  document.getElementById('modal-entry').value    = al ? al.triggeredPrice || '' : '';
  document.getElementById('modal-entry').readOnly = false;
  document.getElementById('modal-exit').value  = '';
  document.getElementById('modal-note').value  = '';
  document.getElementById('modal-bg').classList.add('open');
}

function openCloseModal(tradeId) {
  pendingClose = tradeId;
  pendingLog   = null;
  const t = trades.find(x => x.id === tradeId);
  if (!t) return;
  document.getElementById('modal-title').textContent = `Close Trade — ${t.ticker}`;
  document.getElementById('modal-entry').value    = t.entryPrice;
  document.getElementById('modal-entry').readOnly = true;
  document.getElementById('modal-exit').value  = '';
  document.getElementById('modal-note').value  = t.note || '';
  document.getElementById('modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('modal-exit').focus(), 100);
}

function closeModal() {
  document.getElementById('modal-bg').classList.remove('open');
  document.getElementById('modal-entry').readOnly = false;
  pendingLog   = null;
  pendingClose = null;
}

document.getElementById('modal-bg').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-bg')) closeModal();
});

function saveTrade() {
  if (pendingClose) { closeTrade(); return; }

  const entry = parseFloat(document.getElementById('modal-entry').value);
  const exit  = parseFloat(document.getElementById('modal-exit').value);
  const note  = document.getElementById('modal-note').value.trim();

  if (!entry || isNaN(entry)) { document.getElementById('modal-entry').focus(); return; }

  const al        = alerts.find(a => a.id === pendingLog);
  const returnPct = (!isNaN(exit) && exit)
    ? parseFloat((((exit - entry) / entry) * 100).toFixed(2))
    : null;

  const trade = {
    id:         Date.now(),
    alertId:    pendingLog,
    ticker:     al ? al.ticker : '—',
    entryPrice: entry,
    exitPrice:  (!isNaN(exit) && exit) ? exit : null,
    returnPct,
    note,
    loggedAt:   new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    alertNote:  al ? al.note : '',
  };

  trades.push(trade);
  saveTrades();
  if (al) { al.status = 'archived'; saveAlerts(); }
  closeModal();

  const retMsg = returnPct != null
    ? ` Return: ${returnPct >= 0 ? '+' : ''}${returnPct}%.`
    : ' Exit not set — you can close it later from your Notebook.';
  addMsg(`Trade logged for ${trade.ticker} — entry at $${entry}.${retMsg}`, 'ai');
  if (document.getElementById('view-notebook').classList.contains('active')) renderNotebook();
}

function closeTrade() {
  const exit = parseFloat(document.getElementById('modal-exit').value);
  const note = document.getElementById('modal-note').value.trim();
  if (!exit || isNaN(exit)) { document.getElementById('modal-exit').focus(); return; }

  const t = trades.find(x => x.id === pendingClose);
  if (t) {
    t.exitPrice = exit;
    t.returnPct = parseFloat((((exit - t.entryPrice) / t.entryPrice) * 100).toFixed(2));
    if (note) t.note = note;
    saveTrades();
  }
  closeModal();
  addMsg(`Trade closed — ${t?.ticker} exited at $${exit}. Return: ${t ? (t.returnPct >= 0 ? '+' : '') + t.returnPct.toFixed(1) + '%' : ''}.`, 'ai');
  if (document.getElementById('view-notebook').classList.contains('active')) renderNotebook();
}

function dismissAlert(alertId, btn) {
  const al = alerts.find(a => a.id === alertId);
  if (al) { al.status = 'archived'; saveAlerts(); }
  btn.closest('.msg-group').remove();
  addMsg('Alert dismissed.', 'ai');
}

// ═══════════════════════════════════════════════════════
// NOTEBOOK
// ═══════════════════════════════════════════════════════
let nbFilter = null;

function setNbFilter(key) {
  nbFilter = (nbFilter === key) ? null : key;
  renderNotebook();
}

function renderNotebook() {
  const active    = alerts.filter(a => a.status === 'active');
  const triggered = alerts.filter(a => a.status === 'triggered');
  const open      = trades.filter(t => t.exitPrice == null);

  document.getElementById('stat-alerts').textContent    = active.length;
  document.getElementById('stat-triggered').textContent = triggered.length;
  document.getElementById('stat-trades').textContent    = trades.length;
  document.getElementById('stat-open').textContent      = open.length;

  ['active', 'triggered', 'trades', 'open'].forEach(k => {
    const el = document.getElementById(`nb-filter-${k}`);
    if (el) el.classList.toggle('nb-filter-active', nbFilter === k);
  });

  const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
  const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

  const aList = document.getElementById('active-alerts-list');
  aList.innerHTML = active.length
    ? active.map(alertCardHTML).join('')
    : '<div class="empty-state"><p>No active alerts. Head to Chat to set one.</p></div>';

  const tList = document.getElementById('triggered-alerts-list');
  if (triggered.length) tList.innerHTML = triggered.map(alertCardHTML).join('');

  const hList    = document.getElementById('trade-history-list');
  const titleEl  = document.getElementById('section-trades-title');
  if (nbFilter === 'open') {
    const openTrades = trades.filter(t => t.exitPrice == null);
    hList.innerHTML = openTrades.length
      ? [...openTrades].reverse().map(tradeCardHTML).join('')
      : '<div class="empty-state"><p>No open positions yet. Log a trade from a triggered alert.</p></div>';
    if (titleEl) titleEl.textContent = 'Open Positions';
  } else {
    if (trades.length) hList.innerHTML = [...trades].reverse().map(tradeCardHTML).join('');
    if (titleEl) titleEl.textContent = 'Trade History';
  }

  if (!nbFilter) {
    show('section-active');
    triggered.length ? show('section-triggered') : hide('section-triggered');
    trades.length    ? show('section-trades')    : hide('section-trades');
  } else if (nbFilter === 'active') {
    show('section-active'); hide('section-triggered'); hide('section-trades');
  } else if (nbFilter === 'triggered') {
    hide('section-active');
    triggered.length ? show('section-triggered') : hide('section-triggered');
    hide('section-trades');
  } else if (nbFilter === 'trades') {
    hide('section-active'); hide('section-triggered');
    trades.length ? show('section-trades') : hide('section-trades');
  } else if (nbFilter === 'open') {
    hide('section-active'); hide('section-triggered');
    show('section-trades');
  }
}

function alertCardHTML(a) {
  const cond      = a.condition === 'below' ? '↓ below' : '↑ above';
  const noteBlock = a.note ? `<div class="alert-note">${escHtml(a.note)}</div>` : '';
  const trigLine  = a.triggeredAt
    ? `<span class="alert-date">Triggered ${a.triggeredAt} at $${a.triggeredPrice}</span>`
    : `<span class="alert-date">Added ${a.addedAt}</span>`;
  const actions   = a.status === 'triggered'
    ? `<div class="alert-actions">
         <button class="btn btn-primary" onclick="openLogModal(${a.id})">Log Trade</button>
         <button class="btn btn-ghost" onclick="archiveAlert(${a.id})">Dismiss</button>
       </div>`
    : `<div class="alert-actions">
         <button class="btn btn-danger" onclick="archiveAlert(${a.id})">Remove</button>
       </div>`;
  return `
    <div class="alert-card" id="acard-${a.id}">
      <div class="alert-card-top">
        <div>
          <div class="alert-ticker">${a.ticker}</div>
          <div class="alert-condition">${cond} $${a.price.toFixed(2)}</div>
        </div>
        <span class="alert-status ${a.status}">${a.status}</span>
      </div>
      ${noteBlock}
      <div class="alert-card-foot">${trigLine}${actions}</div>
    </div>`;
}

function tradeCardHTML(t) {
  const hasReturn = t.returnPct != null;
  const retClass  = hasReturn ? (t.returnPct >= 0 ? 'pos' : 'neg') : '';
  const priceText = t.exitPrice ? `$${t.entryPrice} → $${t.exitPrice}` : `Entry: $${t.entryPrice}`;
  const retEl     = hasReturn
    ? `<div class="trade-return ${retClass}">${t.returnPct >= 0 ? '+' : ''}${t.returnPct.toFixed(1)}%</div>`
    : `<button class="btn btn-ghost trade-close-btn" onclick="openCloseModal(${t.id})">Close Trade</button>`;
  return `
    <div class="trade-card">
      <div class="trade-ticker">${t.ticker}</div>
      <div class="trade-details">
        <div class="trade-note">${escHtml(t.note || t.alertNote || '—')}</div>
        <div class="trade-prices">${priceText} · ${t.loggedAt}</div>
      </div>
      ${retEl}
    </div>`;
}

function archiveAlert(id) {
  const a = alerts.find(x => x.id === id);
  if (a) { a.status = 'archived'; saveAlerts(); }
  const card = document.getElementById('acard-' + id);
  if (card) card.remove();
  renderNotebook();
}

// ═══════════════════════════════════════════════════════
// ALERTS PAGE
// ═══════════════════════════════════════════════════════
let alertsSearch = '';
let alertsSort   = 'alpha';  // 'alpha' | 'signal' | 'count'

const SIGNAL_ORDER = { triggered: 0, confluence: 1, near: 2, monitoring: 3 };

function filterAlerts(val) {
  alertsSearch = val.trim().toUpperCase();
  renderAlerts();
}

function setAlertsSort(mode) {
  alertsSort = mode;
  ['alpha', 'signal', 'count'].forEach(m => {
    document.getElementById(`alsort-${m}`)?.classList.toggle('active', m === mode);
  });
  renderAlerts();
}

function renderAlerts() {
  const feed      = document.getElementById('alerts-feed');
  const emptyEl   = document.getElementById('alerts-empty');
  const noKeyEl   = document.getElementById('alerts-no-key');
  const loadingEl = document.getElementById('alerts-loading');
  const toolbar   = document.getElementById('alerts-toolbar');

  emptyEl.style.display   = 'none';
  noKeyEl.style.display   = 'none';
  loadingEl.style.display = 'none';
  feed.innerHTML = '';

  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'triggered');
  if (!activeAlerts.length) { emptyEl.style.display = ''; if (toolbar) toolbar.style.display = 'none'; return; }
  if (!finnhubKey) noKeyEl.style.display = '';
  if (toolbar) toolbar.style.display = '';

  const grouped = {};
  activeAlerts.forEach(a => {
    if (!grouped[a.ticker]) grouped[a.ticker] = [];
    grouped[a.ticker].push(a);
  });

  let tickers = Object.keys(grouped);

  // Apply search filter
  if (alertsSearch) tickers = tickers.filter(t => t.includes(alertsSearch));

  // Sort
  if (alertsSort === 'alpha') {
    tickers.sort((a, b) => a.localeCompare(b));
  } else if (alertsSort === 'signal') {
    tickers.sort((a, b) => {
      const sa = SIGNAL_ORDER[signalLabel(grouped[a], tickerPrices[a]?.c)] ?? 99;
      const sb = SIGNAL_ORDER[signalLabel(grouped[b], tickerPrices[b]?.c)] ?? 99;
      return sa !== sb ? sa - sb : a.localeCompare(b);
    });
  } else if (alertsSort === 'count') {
    tickers.sort((a, b) => grouped[b].length - grouped[a].length || a.localeCompare(b));
  }

  document.getElementById('alerts-subtitle').textContent =
    alertsSearch
      ? `${tickers.length} of ${Object.keys(grouped).length} tickers match "${alertsSearch}"`
      : `${activeAlerts.length} alert${activeAlerts.length !== 1 ? 's' : ''} across ${Object.keys(grouped).length} ticker${Object.keys(grouped).length !== 1 ? 's' : ''}`;

  feed.innerHTML = tickers.length
    ? tickers.map(ticker => tickerGroupHTML(ticker, grouped[ticker], tickerPrices[ticker])).join('')
    : '<div class="empty-state"><p>No tickers match your search.</p></div>';
}

async function checkPrices() {
  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'triggered');
  if (!activeAlerts.length) return;
  if (!finnhubKey) { switchView('settings'); return; }

  const tickers = [...new Set(activeAlerts.map(a => a.ticker))];
  const feed    = document.getElementById('alerts-feed');
  const loading = document.getElementById('alerts-loading');

  feed.innerHTML = '';
  loading.style.display = '';

  try {
    const results = await Promise.all(tickers.map(async t => {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${finnhubKey}`);
      if (!r.ok) throw new Error(`Quote fetch failed for ${t}`);
      const d = await r.json();
      return [t, { c: d.c, pc: d.pc, h: d.h, l: d.l, o: d.o }];
    }));
    results.forEach(([ticker, data]) => { tickerPrices[ticker] = data; });
  } catch(e) { console.warn('Price fetch error:', e.message); }

  loading.style.display = 'none';
  renderAlerts();
}

function getProximity(alert, currentPrice) {
  return alert.condition === 'below'
    ? ((currentPrice - alert.price) / currentPrice) * 100
    : ((alert.price - currentPrice) / currentPrice) * 100;
}

function signalLabel(groupAlerts, price) {
  if (!price) return null;
  const dists    = groupAlerts.map(a => getProximity(a, price));
  const triggered = dists.filter(d => d <= 0).length;
  const near      = dists.filter(d => d > 0 && d <= 5).length;
  if (triggered > 0 && near > 0) return 'confluence';
  if (triggered >= 2)            return 'confluence';
  if (triggered === 1)           return 'triggered';
  if (near >= 2)                 return 'confluence';
  if (near === 1)                return 'near';
  return 'monitoring';
}

function tickerGroupHTML(ticker, groupAlerts, priceData) {
  const price     = priceData?.c;
  const prevClose = priceData?.pc;
  const signal    = signalLabel(groupAlerts, price);

  const signalBadge = signal ? {
    triggered:  `<span class="tg-badge triggered">Triggered</span>`,
    confluence: `<span class="tg-badge confluence">⚡ Confluence</span>`,
    near:       `<span class="tg-badge near">Near Alert</span>`,
    monitoring: `<span class="tg-badge monitoring">Monitoring</span>`,
  }[signal] : '';

  let priceHTML = '';
  if (price) {
    const chg    = prevClose ? ((price - prevClose) / prevClose * 100) : null;
    const chgCls = chg === null ? '' : chg >= 0 ? 'pos' : 'neg';
    const chgStr = chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '';
    priceHTML = `<span class="tg-price">$${price.toFixed(2)}</span>
                 ${chg !== null ? `<span class="tg-change ${chgCls}">${chgStr}</span>` : ''}`;
  } else {
    priceHTML = `<span class="tg-price no-price">No price data</span>`;
  }

  const rowsHTML = groupAlerts.map(a => alertRowHTML(a, price)).join('');
  const analysis = generateSmartAnalysis(ticker, groupAlerts, price, prevClose);

  return `
    <div class="ticker-group${signal ? ' signal-' + signal : ''}">
      <div class="tg-header">
        <div class="tg-left">
          <span class="tg-ticker">${ticker}</span>
          ${priceHTML}
        </div>
        <div class="tg-right">
          ${signalBadge}
          <span class="tg-count">${groupAlerts.length} alert${groupAlerts.length !== 1 ? 's' : ''}</span>
          <button class="tg-expand-btn" onclick="toggleTgStats('${ticker}', this)" title="Show technicals">
            Technicals
            <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>
      <div class="tg-stats-wrap tg-collapsed" id="stats-${ticker}">
        <div class="stats-ph"><span class="stats-ph-text">Calculating technicals…</span></div>
      </div>
      <div class="tg-rows">${rowsHTML}</div>
      <div class="smart-block">
        <div class="smart-label">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Smart Analysis
        </div>
        <p class="smart-text">${analysis}</p>
        ${signal === 'triggered' || signal === 'confluence'
          ? `<button class="btn btn-primary smart-act-btn" onclick="openLogModal(${groupAlerts.find(a => a.status === 'triggered')?.id || groupAlerts[0].id})">Log Trade</button>`
          : ''}
      </div>
    </div>`;
}

function alertRowHTML(alert, price) {
  const dist      = price ? getProximity(alert, price) : null;
  const triggered = dist !== null && dist <= 0;
  const barPct    = dist === null ? 0 : Math.max(0, Math.min(100, (1 - dist / 10) * 100));
  const dirSymbol = alert.condition === 'below' ? '↓' : '↑';
  const dirLabel  = alert.condition === 'below' ? 'Below' : 'Above';

  let distLabel = '', rowClass = 'ar-row';
  if (dist === null)     { distLabel = 'No price'; }
  else if (triggered)    { distLabel = `${Math.abs(dist).toFixed(1)}% past level`; rowClass += ' ar-triggered'; }
  else if (dist <= 3)    { distLabel = `${dist.toFixed(1)}% away`; rowClass += ' ar-near'; }
  else if (dist <= 8)    { distLabel = `${dist.toFixed(1)}% away`; rowClass += ' ar-watching'; }
  else                   { distLabel = `${dist.toFixed(1)}% away`; }

  const noteHTML = alert.note ? `<div class="ar-note">"${escHtml(alert.note)}"</div>` : '';

  return `
    <div class="${rowClass}">
      <div class="ar-info">
        <div class="ar-header">
          <span class="ar-dir ${alert.condition}">${dirSymbol}</span>
          <span class="ar-level">${dirLabel} $${alert.price.toFixed(2)}</span>
          <span class="alert-status ${alert.status}">${alert.status}</span>
        </div>
        ${noteHTML}
      </div>
      <div class="ar-proximity">
        <div class="ar-bar"><div class="ar-bar-fill ${triggered ? 'fill-triggered' : dist !== null && dist <= 3 ? 'fill-near' : 'fill-watch'}" style="width:${barPct}%"></div></div>
        <div class="ar-dist-label">${distLabel}</div>
      </div>
    </div>`;
}

function generateSmartAnalysis(ticker, groupAlerts, price, prevClose) {
  if (!price) {
    const notes = groupAlerts.map(a => a.note).filter(Boolean);
    if (!notes.length)
      return `You have ${groupAlerts.length} price alert${groupAlerts.length !== 1 ? 's' : ''} set for ${ticker}. Tap "Check Prices" to fetch live quotes and see proximity to each level.`;
    if (groupAlerts.length > 1) {
      const sorted = [...groupAlerts].sort((a, b) => b.price - a.price);
      const levels = sorted.map(a => `$${a.price.toFixed(2)}${a.note ? ` (${a.note})` : ''}`).join(' → ');
      return `${ticker} layered thesis: ${levels}. You're watching ${groupAlerts.length} levels — tap "Check Prices" to see where price sits relative to each.`;
    }
    return `Thesis for ${ticker} at $${groupAlerts[0].price.toFixed(2)}: "${notes[0]}". Tap "Check Prices" to see live proximity.`;
  }

  const withDist = groupAlerts.map(a => ({ ...a, dist: getProximity(a, price) }));
  const triggered = withDist.filter(a => a.dist <= 0);
  const near      = withDist.filter(a => a.dist > 0 && a.dist <= 5);
  const watching  = withDist.filter(a => a.dist > 5);
  const chgPct    = prevClose ? ((price - prevClose) / prevClose * 100) : null;
  const chgClause = chgPct !== null
    ? ` The stock is ${chgPct >= 0 ? 'up' : 'down'} ${Math.abs(chgPct).toFixed(2)}% from yesterday's close.`
    : '';

  let lines = [];

  if (triggered.length > 0 && (near.length > 0 || triggered.length > 1)) {
    const trigged = triggered.map(a => `$${a.price.toFixed(2)}`).join(' and ');
    lines.push(`${ticker} has hit ${triggered.length > 1 ? triggered.length + ' of your alert levels' : 'your ' + trigged + ' alert'}.`);
    if (triggered[0].note) lines.push(`You originally wanted this because: "${triggered[0].note}".`);
    if (near.length) lines.push(`Additionally, ${near.map(a => `$${a.price.toFixed(2)} is ${a.dist.toFixed(1)}% away`).join(', ')} — your thesis is converging.`);
    lines.push(`This is the confluence your notes were pointing toward. Consider acting on your plan.`);
  } else if (triggered.length > 0) {
    const a = triggered[0];
    lines.push(`${ticker} has hit your $${a.price.toFixed(2)} ${a.condition} alert.${chgClause}`);
    if (a.note) lines.push(`You set this alert because: "${a.note}".`);
    if (watching.length) lines.push(`You also have ${watching.length} more alert${watching.length > 1 ? 's' : ''} further out.`);
    lines.push(`Your setup is live. Review your notes and decide.`);
  } else if (near.length >= 2) {
    lines.push(`${ticker} is approaching ${near.length} of your alerts simultaneously.${chgClause}`);
    near.forEach(a => { if (a.note) lines.push(`At $${a.price.toFixed(2)}: "${a.note}" — ${a.dist.toFixed(1)}% away.`); });
    lines.push(`Multiple signals pointing at the same zone. Watch the next few percent closely.`);
  } else if (near.length === 1) {
    const a = near[0];
    lines.push(`${ticker} is ${a.dist.toFixed(1)}% from your $${a.price.toFixed(2)} alert.${chgClause}`);
    if (a.note) lines.push(`You wanted this level because: "${a.note}".`);
    lines.push(`Getting close — have your plan ready.`);
  } else {
    const closest = withDist.reduce((a, b) => a.dist < b.dist ? a : b);
    lines.push(`Your nearest ${ticker} alert is ${closest.dist.toFixed(1)}% away at $${closest.price.toFixed(2)}.${chgClause}`);
    if (closest.note) lines.push(`Thesis: "${closest.note}".`);
    lines.push(`Still some distance — continue monitoring.`);
  }
  return lines.join(' ');
}

// ═══════════════════════════════════════════════════════
// FINNHUB HELPERS
// ═══════════════════════════════════════════════════════
async function fetchQuote(ticker) {
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`);
  if (!r.ok) throw new Error(`Quote fetch failed (${r.status})`);
  return r.json();
}

async function fetchMovingAverage(ticker, period) {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - Math.ceil(period * 1.6) * 86400;
  const r = await fetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${finnhubKey}`
  );
  if (!r.ok) throw new Error(`Candle fetch failed (${r.status})`);
  const d = await r.json();
  if (d.s !== 'ok' || !d.c || d.c.length < period)
    throw new Error(`Not enough data — got ${d.c?.length || 0} candles, need ${period}`);
  const closes = d.c.slice(-period);
  return parseFloat((closes.reduce((a, b) => a + b, 0) / closes.length).toFixed(2));
}

// ═══════════════════════════════════════════════════════
// TECHNICAL INDICATORS (for Alerts page stats panel)
// ═══════════════════════════════════════════════════════
function _normalCDF(x) {
  const a = [0.31938153, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const p = 1 - Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) *
            k * (a[0] + k * (a[1] + k * (a[2] + k * (a[3] + k * a[4]))));
  return x >= 0 ? p : 1 - p;
}

function _calcATR(highs, lows, closes, n = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  if (trs.length < n) return null;
  let atr = trs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < trs.length; i++) atr = (atr * (n - 1) + trs[i]) / n;
  return atr;
}

function _calcRSI(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let ag = 0, al = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i-1]; d > 0 ? ag += d : al -= d; }
  ag /= n; al /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
  }
  return 100 - 100 / (1 + ag / (al || 0.0001));
}

function _calcHV(closes, n = 20) {
  if (closes.length < n + 1) return null;
  const slice = closes.slice(-(n + 1));
  const lr    = [];
  for (let i = 1; i < slice.length; i++) lr.push(Math.log(slice[i] / slice[i-1]));
  const mean = lr.reduce((a, b) => a + b, 0) / lr.length;
  const variance = lr.reduce((s, r) => s + (r - mean) ** 2, 0) / (lr.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

function _calcBB(closes, n = 20, mult = 2) {
  if (closes.length < n) return null;
  const recent = closes.slice(-n);
  const sma    = recent.reduce((a, b) => a + b, 0) / n;
  const std    = Math.sqrt(recent.reduce((s, c) => s + (c - sma) ** 2, 0) / n);
  return { sma, upper: sma + mult * std, lower: sma - mult * std, std };
}

function _calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14) {
  if (closes.length < rsiPeriod + stochPeriod + 1) return null;
  const rsiSeries = [];
  for (let end = rsiPeriod; end <= closes.length - 1; end++) {
    const slice = closes.slice(end - rsiPeriod, end + 1);
    let ag = 0, al = 0;
    for (let i = 1; i <= rsiPeriod; i++) { const d = slice[i] - slice[i-1]; d > 0 ? ag += d : al -= d; }
    ag /= rsiPeriod; al /= rsiPeriod;
    rsiSeries.push(100 - 100 / (1 + ag / (al || 0.0001)));
  }
  if (rsiSeries.length < stochPeriod) return null;
  const recent = rsiSeries.slice(-stochPeriod);
  const lo = Math.min(...recent), hi = Math.max(...recent);
  const cur = rsiSeries[rsiSeries.length - 1];
  return hi === lo ? 50 : ((cur - lo) / (hi - lo)) * 100;
}

function _triggerProb(current, target, hvPct, days) {
  if (!hvPct || hvPct <= 0 || !current || !target) return null;
  const dailySigma = (hvPct / 100) / Math.sqrt(252);
  const logDist    = Math.abs(Math.log(target / current));
  return Math.round(Math.min(99, Math.max(1, 2 * _normalCDF(-logDist / (dailySigma * Math.sqrt(days))) * 100)));
}

function _statCell(label, val, sub, color) {
  return `<div class="tgs-stat">
    <div class="tgs-stat-label">${label}</div>
    <div class="tgs-stat-val"${color ? ` style="color:${color}"` : ''}>${val}</div>
    ${sub ? `<div class="tgs-stat-sub">${sub}</div>` : ''}
  </div>`;
}

function _buildStatsHTML(price, hv, atr, rsi, bb, stochRsi, groupAlerts, priceData, histMode) {
  const primary = [...groupAlerts].sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0];

  const prob7  = _triggerProb(price, primary.price, hv, 7);
  const prob30 = _triggerProb(price, primary.price, hv, 30);
  const probColor = prob30 >= 65 ? '#16a34a' : prob30 >= 35 ? '#d97706' : '#ef4444';
  const probLabel = prob30 >= 65 ? 'High likelihood' : prob30 >= 35 ? 'Moderate likelihood' : 'Low likelihood';

  const atrPct    = atr && price ? (atr / price * 100) : null;
  const distRaw   = price ? (primary.price - price) : null;
  const distPct   = distRaw != null ? (distRaw / price * 100) : null;
  const distATRs  = atr && distRaw != null ? (Math.abs(distRaw) / atr) : null;
  const rsiColor  = !rsi ? null : rsi > 70 ? '#ef4444' : rsi < 30 ? '#16a34a' : null;
  const rsiLabel  = !rsi ? '—' : rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : rsi > 55 ? 'Leaning bull' : rsi < 45 ? 'Leaning bear' : 'Neutral';
  const hvLabel   = !hv  ? '—' : hv > 60 ? 'Very high' : hv > 35 ? 'Elevated' : hv > 20 ? 'Normal' : 'Low';
  const hvColor   = !hv  ? null : hv > 60 ? '#ef4444' : hv > 35 ? '#d97706' : '#16a34a';

  let bbLabel = '—', bbPct = null, bbColor = null;
  if (bb && price) {
    bbPct   = (price - bb.lower) / (bb.upper - bb.lower) * 100;
    bbLabel = bbPct > 80 ? 'Near upper' : bbPct < 20 ? 'Near lower' : 'Mid-range';
    bbColor = bbPct > 80 ? '#ef4444' : bbPct < 20 ? '#16a34a' : null;
  }
  const srLabel = stochRsi == null ? '—' : stochRsi > 80 ? 'Overbought zone' : stochRsi < 20 ? 'Oversold zone' : 'Mid-range';
  const srColor = stochRsi == null ? null : stochRsi > 80 ? '#ef4444' : stochRsi < 20 ? '#16a34a' : null;

  const dayChg      = (priceData?.c && priceData?.pc) ? ((priceData.c - priceData.pc) / priceData.pc * 100) : null;
  const todayRange  = (priceData?.h && priceData?.l) ? (priceData.h - priceData.l) : null;
  const intradayPos = (todayRange && priceData?.l) ? ((price - priceData.l) / todayRange * 100) : null;

  const multiProb = groupAlerts.length > 1 ? groupAlerts.map(al => {
    const p30 = _triggerProb(price, al.price, hv, 30);
    const p7  = _triggerProb(price, al.price, hv, 7);
    const c   = p30 >= 65 ? '#16a34a' : p30 >= 35 ? '#d97706' : '#ef4444';
    const dir = al.condition === 'below' ? '▼' : '▲';
    return `<div class="tgs-alert-prob">
      <span class="tgs-ap-label">${dir} $${al.price.toFixed(2)}</span>
      <span class="tgs-ap-bars"><span class="tgs-ap-bar-bg"><span class="tgs-ap-bar-fill" style="width:${p30||0}%;background:${c}"></span></span></span>
      <span class="tgs-ap-pct" style="color:${c}">${p30 != null ? p30 + '%' : '—'}</span>
      <span class="tgs-ap-sub">30d</span>
      <span class="tgs-ap-pct2">${p7 != null ? p7 + '%' : '—'}</span>
      <span class="tgs-ap-sub">7d</span>
    </div>`;
  }).join('') : '';

  const modeTag = histMode ? '' : `<div class="tgs-mode-tag">Estimated from today's range — historical data unavailable</div>`;

  return `<div class="tgs-panel">
    <div class="tgs-left">
      <div class="tgs-prob-head">Trigger probability</div>
      <div class="tgs-prob-val" style="color:${probColor}">${prob30 != null ? prob30 + '%' : '—'}</div>
      <div class="tgs-prob-bar-bg"><div class="tgs-prob-bar-fill" style="width:${prob30||0}%;background:${probColor}"></div></div>
      <div class="tgs-prob-label" style="color:${probColor}">${probLabel}</div>
      <div class="tgs-prob-horizons">
        <span>7-day <b style="color:${probColor}">${prob7 != null ? prob7 + '%' : '—'}</b></span>
        <span>30-day <b style="color:${probColor}">${prob30 != null ? prob30 + '%' : '—'}</b></span>
      </div>
      ${multiProb ? `<div class="tgs-multi">${multiProb}</div>` : ''}
    </div>
    <div class="tgs-right">
      ${modeTag}
      <div class="tgs-grid">
        ${_statCell('ATR (14)', atr ? '$' + atr.toFixed(2) : '—', atrPct ? atrPct.toFixed(2) + '% avg daily range' : '')}
        ${_statCell('RSI (14)', rsi ? rsi.toFixed(1) : '—', rsiLabel, rsiColor)}
        ${_statCell('Hist. vol (20d)', hv ? hv.toFixed(1) + '%' : '—', hvLabel, hvColor)}
        ${_statCell('Distance', distPct != null ? (distPct >= 0 ? '+' : '') + distPct.toFixed(2) + '%' : '—', distATRs != null ? distATRs.toFixed(1) + ' ATRs away' : '')}
        ${_statCell('Est. days to alert', distATRs != null ? distATRs.toFixed(1) + 'd' : '—', 'at avg ATR pace')}
        ${_statCell('Bollinger band', bbLabel, bbPct != null ? bbPct.toFixed(0) + '% of range' : '', bbColor)}
        ${_statCell('Stoch RSI', stochRsi != null ? stochRsi.toFixed(0) : '—', srLabel, srColor)}
        ${_statCell('Day change', dayChg != null ? (dayChg >= 0 ? '+' : '') + dayChg.toFixed(2) + '%' : '—',
            intradayPos != null ? intradayPos.toFixed(0) + '% of today\'s range' : '',
            dayChg == null ? null : dayChg > 0 ? '#16a34a' : dayChg < 0 ? '#ef4444' : null)}
      </div>
    </div>
  </div>`;
}

async function _fetchHistory(ticker) {
  const yfUrl   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=6mo`;
  const proxies = [
    yfUrl,
    `https://corsproxy.io/?url=${encodeURIComponent(yfUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yfUrl)}`,
  ];
  for (const url of proxies) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const j = await r.json();
      const result = j?.chart?.result?.[0];
      const q      = result?.indicators?.quote?.[0];
      if (q?.close?.length >= 20) return result;
    } catch(_) {}
  }
  return null;
}

async function renderTickerStats(ticker, groupAlerts, priceData) {
  const wrap = document.getElementById(`stats-${ticker}`);
  if (!wrap) return;
  const price = priceData?.c;
  if (!price) {
    wrap.innerHTML = `<div class="stats-ph"><span class="stats-ph-err">No price data — refresh prices first</span></div>`;
    return;
  }
  try {
    const hist = await _fetchHistory(ticker);
    if (hist) {
      const q   = hist.indicators.quote[0];
      const raw = (hist.timestamp || [])
        .map((t, i) => ({ t, c: q.close[i], h: q.high[i], l: q.low[i] }))
        .filter(d => d.c != null && d.h != null && d.l != null);
      const closes = raw.map(d => d.c);
      const highs  = raw.map(d => d.h);
      const lows   = raw.map(d => d.l);
      wrap.innerHTML = _buildStatsHTML(
        price, _calcHV(closes), _calcATR(highs, lows, closes),
        _calcRSI(closes), _calcBB(closes), _calcStochRSI(closes),
        groupAlerts, priceData, true
      );
    } else {
      const h = priceData?.h, l = priceData?.l, pc = priceData?.pc;
      const tr    = (h && l && pc) ? Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)) : (h && l ? h - l : null);
      const hvEst = tr ? (tr / price) * Math.sqrt(252) * 100 : null;
      wrap.innerHTML = _buildStatsHTML(price, hvEst, tr || null, null, null, null, groupAlerts, priceData, false);
    }
  } catch(e) {
    console.warn(`Stats error for ${ticker}:`, e);
    wrap.innerHTML = `<div class="stats-ph"><span class="stats-ph-err">Could not compute technical data</span></div>`;
  }
}

async function renderAllStats() {
  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'triggered');
  const grouped = {};
  activeAlerts.forEach(a => { if (!grouped[a.ticker]) grouped[a.ticker] = []; grouped[a.ticker].push(a); });
  for (const [ticker, groupAlerts] of Object.entries(grouped)) {
    await renderTickerStats(ticker, groupAlerts, tickerPrices[ticker]);
  }
}

// ═══════════════════════════════════════════════════════
// NEWS ENGINE
// ═══════════════════════════════════════════════════════
function newsShow(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function newsHide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function connectNewsKey() {
  const val = (document.getElementById('news-key-input')?.value || '').trim();
  if (!val) return;
  finnhubKey = val;
  localStorage.setItem('tn-finnhub-key', val);
  lastNewsFetch = 0;
  loadNews(true);
}

function getWatchlistTickers() {
  return [...new Set(alerts.filter(a => a.status === 'active' || a.status === 'triggered').map(a => a.ticker))];
}

async function fetchTickerNews(ticker) {
  const to   = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const resp = await fetch(
    `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${finnhubKey}`
  );
  if (!resp.ok) throw new Error(`Finnhub error ${resp.status} — check your API key`);
  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error('Unexpected response — check your API key');

  // Score by relevance: articles that mention the ticker symbol in headline score higher
  const tLower = ticker.toLowerCase();
  const scored = data
    .filter(a => a.headline && a.datetime)
    .map(a => {
      const combined = (a.headline + ' ' + (a.summary || '')).toLowerCase();
      const score = combined.includes(tLower) ? 2 : combined.includes(ticker) ? 1 : 0;
      return { ...a, watchlistTicker: ticker, _score: score };
    });

  // Sort: most relevant first, then most recent
  scored.sort((a, b) => b._score - a._score || b.datetime - a.datetime);
  return scored.slice(0, 12);
}

async function loadNews(force = false) {
  const CACHE_MS = 5 * 60 * 1000;
  if (!force && Date.now() - lastNewsFetch < CACHE_MS && allNewsItems.length) {
    renderNewsCards();
    return;
  }

  newsHide('news-setup'); newsHide('news-no-alerts'); newsHide('news-error');
  newsHide('news-filter-row'); newsHide('news-feed'); newsHide('news-ai-summary');
  document.getElementById('news-feed').innerHTML = '';

  if (!finnhubKey) { newsShow('news-setup'); return; }

  const tickers = getWatchlistTickers();
  if (!tickers.length) { newsShow('news-no-alerts'); return; }

  newsShow('news-loading');

  try {
    const batches = await Promise.all(tickers.map(fetchTickerNews));
    let items     = batches.flat();
    const seen    = new Set();
    items = items.filter(a => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
    items.sort((a, b) => b.datetime - a.datetime);
    allNewsItems  = items;
    lastNewsFetch = Date.now();

    newsHide('news-loading');

    if (!items.length) {
      document.getElementById('news-error-msg').textContent = 'No recent news found for your tickers. Try refreshing later.';
      newsShow('news-error');
      return;
    }

    const mins = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('news-subtitle').textContent = `${items.length} stories · Updated ${mins} · Powered by Finnhub`;

    renderNewsFilters(tickers);
    newsShow('news-filter-row'); newsShow('news-feed');
    renderNewsCards();
    generateNewsSummary(items);
  } catch(err) {
    newsHide('news-loading');
    document.getElementById('news-error-msg').textContent = err.message;
    newsShow('news-error');
  }
}

function renderNewsFilters(tickers) {
  const row = document.getElementById('news-filter-row');
  row.innerHTML = ['ALL', ...tickers].map(t =>
    `<button class="filter-btn${t === newsFilterTicker ? ' active' : ''}" data-ticker="${t}" onclick="filterNews('${t}')">
       ${t === 'ALL' ? 'All' : t}
     </button>`
  ).join('');
}

function filterNews(ticker) {
  newsFilterTicker = ticker;
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.ticker === ticker)
  );
  renderNewsCards();
}

function renderNewsCards() {
  const feed     = document.getElementById('news-feed');
  const filtered = newsFilterTicker === 'ALL'
    ? allNewsItems
    : allNewsItems.filter(a => a.watchlistTicker === newsFilterTicker);
  if (!filtered.length) {
    feed.innerHTML = '<div class="empty-state"><p>No recent news for this ticker.</p></div>';
    return;
  }
  feed.innerHTML = `<div class="news-grid">${filtered.map(newsCardHTML).join('')}</div>`;
}

function newsCardHTML(article) {
  const ticker    = article.watchlistTicker;
  const al        = alerts.filter(a => a.ticker === ticker && (a.status === 'active' || a.status === 'triggered'));
  const sentiment = getSentiment(article.headline + ' ' + (article.summary || ''));
  const insight   = generateInsight(article, al, sentiment);
  const ago       = timeAgo(article.datetime);
  const sentClass = sentiment === 'bullish' ? 'pos' : sentiment === 'bearish' ? 'neg' : 'neu';
  const sentLabel = sentiment === 'bullish' ? 'Bullish' : sentiment === 'bearish' ? 'Bearish' : 'Neutral';
  const imgHTML   = article.image
    ? `<img class="ncm-img" src="${escHtml(article.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  return `
    <div class="news-card-mini">
      ${imgHTML}
      <div class="ncm-body">
        <div class="ncm-meta">
          <span class="news-ticker-badge">${ticker}</span>
          <span class="news-sentiment-dot ${sentClass}"></span>
          <span class="ncm-source">${escHtml(article.source)} · ${ago}</span>
        </div>
        <a class="ncm-headline" href="${escHtml(article.url)}" target="_blank" rel="noopener noreferrer">
          ${escHtml(article.headline)}
        </a>
        <div class="ncm-insight">
          <div class="ncm-insight-label">
            <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Why it matters
          </div>
          <p class="ncm-insight-text">${insight}</p>
        </div>
        <span class="ncm-sentiment ${sentClass}">${sentLabel}</span>
      </div>
    </div>`;
}

async function generateNewsSummary(items) {
  const el = document.getElementById('news-ai-summary');
  if (!el || !geminiKey || !items.length) return;
  el.style.display = '';
  el.innerHTML = `
    <div class="news-briefing-block loading">
      <div class="news-briefing-label">
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Last 24 Hours
      </div>
      <p class="news-briefing-text">Tracing the last 24 hours of catalysts and price reactions…</p>
    </div>`;

  const tickers   = [...new Set(items.map(a => a.watchlistTicker))].join(', ');
  const headlines = items.slice(0, 18).map(a => {
    const ts = new Date(a.datetime * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `[${a.watchlistTicker}] ${ts} | ${a.headline}${a.summary ? ` | ${a.summary.trim()}` : ''}`;
  }).join('\n');

  const newsModel = _activeModel || GEMINI_MODELS[0];
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${newsModel}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text:
            `You are a sharp trading desk analyst. Review these headlines for ${tickers}. Write exactly 2-3 sentences: identify the single most important development across all tickers, name the ticker and event, and state whether it is bullish or bearish and why. Be specific with numbers if available. Plain text only, no bullets, no markdown.\n\nHeadlines:\n${headlines}`
          }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 300,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!text) { el.style.display = 'none'; return; }
    const watchedTickers = getWatchlistTickers();
    const tickerList = watchedTickers.length ? watchedTickers.join(', ') : 'my watchlist';
    const prompt = `Tell me about the news for the tickers I am watching today: ${tickerList}. What are the key developments, what do they mean for each stock, and how does this affect my alerts?`;
    el.innerHTML = `
      <div class="news-briefing-block">
        <div class="news-briefing-label">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Top story
        </div>
        <p class="news-briefing-text">${escHtml(text)}</p>
        <button class="news-dig-btn" onclick="digDeeperNews(${JSON.stringify(prompt)})">
          Want to know more?
          <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>`;
  } catch(e) { el.style.display = 'none'; }
}

function getSentiment(text) {
  const t    = text.toLowerCase();
  const bull = ['surge','soar','rally','gain','beat','record','strong','growth','upgrade','profit','outperform','exceed','jump','rise','high','win','positive','bullish','breakout','launch','partnership','contract'];
  const bear = ['drop','fall','decline','loss','miss','weak','concern','risk','cut','warn','downgrade','negative','sell','selloff','crash','trouble','lawsuit','investigation','probe','fine','penalty','layoff','bearish'];
  const bs   = bull.filter(w => t.includes(w)).length;
  const ss   = bear.filter(w => t.includes(w)).length;
  return bs > ss ? 'bullish' : ss > bs ? 'bearish' : 'neutral';
}

function generateInsight(article, tickerAlerts, sentiment) {
  const t = (article.headline + ' ' + (article.summary || '')).toLowerCase();
  let base = '';
  if (/earnings|eps|revenue|guidance|quarterly|q[1-4]|profit|beat|miss/.test(t))
    base = 'Earnings data is the primary catalyst for institutional repositioning and can cause sharp, sustained price moves';
  else if (/analyst|upgrade|downgrade|price target|overweight|underweight|initiat/.test(t))
    base = 'Analyst actions shift institutional money flows and often accelerate a move toward key price levels';
  else if (/fed|federal reserve|interest rate|inflation|cpi|fomc|monetary|powell/.test(t))
    base = 'Macro policy decisions affect growth stock valuations across the board and can override near-term technicals';
  else if (/merger|acquisition|buyout|takeover|acquired|deal/.test(t))
    base = 'M&A events cause immediate and often sustained price dislocations that invalidate prior technical levels';
  else if (/lawsuit|sec|investigation|regulatory|fine|penalty|probe|fraud/.test(t))
    base = 'Regulatory risk events introduce sustained headline risk that can suppress price action for weeks';
  else if (/ai|artificial intelligence|partnership|contract|launch|product|unveil/.test(t))
    base = 'Business catalysts shift the forward-looking growth narrative and can re-rate the stock rapidly';
  else if (/insider|ceo|cfo|executive|leadership|resign|appoint/.test(t))
    base = 'Leadership changes and insider activity often signal broader strategic shifts worth monitoring';
  else if (/short|squeeze|options|call|put|flow|unusual/.test(t))
    base = 'Options and flow signals indicate where large money is positioning ahead of potential moves';
  else
    base = 'Monitor for follow-on coverage that could amplify price movement toward your alert levels';

  if (tickerAlerts.length) {
    const a   = tickerAlerts[0];
    const lvl = `$${a.price.toFixed(2)}`;
    if      (sentiment === 'bullish' && a.condition === 'above')
      return `${base}. This bullish signal is a tailwind for your ${lvl} upside alert.`;
    else if (sentiment === 'bearish' && a.condition === 'below')
      return `${base}. This bearish signal supports your ${lvl} downside alert.`;
    else if (sentiment === 'bullish' && a.condition === 'below')
      return `${base}. Note: this bullish news is a headwind for your ${lvl} downside alert.`;
    else if (sentiment === 'bearish' && a.condition === 'above')
      return `${base}. Note: this bearish signal is a headwind for your ${lvl} upside alert.`;
  }
  return base + '.';
}

function timeAgo(unixSec) {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 3600)  return Math.max(1, Math.floor(diff / 60)) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

// ═══════════════════════════════════════════════════════
// STATS PAGE
// ═══════════════════════════════════════════════════════
function renderStats() {
  const closed = trades.filter(t => t.exitPrice != null && t.returnPct != null);

  const emptyEl    = document.getElementById('stats-empty');
  const summaryEl  = document.getElementById('stats-summary-row');
  const pnlEl      = document.getElementById('stats-pnl-section');
  const patternsEl = document.getElementById('stats-patterns-section');
  const recsEl     = document.getElementById('stats-recs-section');
  const recentEl   = document.getElementById('stats-recent-section');

  if (closed.length < 2) {
    emptyEl.style.display = '';
    [summaryEl, pnlEl, patternsEl, recsEl, recentEl].forEach(el => { if (el) el.style.display = 'none'; });
    return;
  }

  emptyEl.style.display = 'none';

  const wins    = closed.filter(t => t.returnPct > 0).length;
  const winRate = Math.round(wins / closed.length * 100);
  const avgRet  = closed.reduce((s, t) => s + t.returnPct, 0) / closed.length;
  const best    = closed.reduce((a, b) => a.returnPct > b.returnPct ? a : b);

  summaryEl.style.display = '';
  if (pnlEl) { pnlEl.style.display = ''; setTimeout(() => renderTradesChart(closed), 80); }

  document.getElementById('ss-trades').textContent = closed.length;

  const wrEl = document.getElementById('ss-winrate');
  wrEl.textContent = winRate + '%';
  wrEl.className   = 'stat-value ' + (winRate >= 50 ? 'green' : 'red');
  document.getElementById('ss-winrate-sub').textContent = `${wins} wins / ${closed.length - wins} losses`;

  const avgEl = document.getElementById('ss-avg');
  avgEl.textContent = (avgRet >= 0 ? '+' : '') + avgRet.toFixed(1) + '%';
  avgEl.className   = 'stat-value ' + (avgRet >= 0 ? 'green' : 'red');

  const bestEl = document.getElementById('ss-best');
  bestEl.textContent = (best.returnPct >= 0 ? '+' : '') + best.returnPct.toFixed(1) + '%';
  bestEl.className   = 'stat-value green';
  document.getElementById('ss-best-sub').textContent = best.ticker;

  const patterns = analyzePatterns(closed);
  if (patterns.length) {
    patternsEl.style.display = '';
    document.getElementById('stats-patterns').innerHTML = patterns.map(patternCardHTML).join('');
  } else { patternsEl.style.display = 'none'; }

  const recs = generateRecommendations(patterns, closed, winRate, avgRet);
  if (recs.length) {
    recsEl.style.display = '';
    document.getElementById('stats-recs').innerHTML =
      `<div class="recs-list">${recs.map(r => `<div class="rec-item"><div class="rec-dot ${r.type}"></div><p>${r.text}</p></div>`).join('')}</div>`;
  } else { recsEl.style.display = 'none'; }

  recentEl.style.display = '';
  document.getElementById('stats-recent').innerHTML = `
    <div class="recent-trades-table">
      <div class="rt-header"><span>Ticker</span><span>Condition</span><span>Entry</span><span>Exit</span><span>Return</span></div>
      ${[...closed].reverse().slice(0, 10).map(recentTradeRowHTML).join('')}
    </div>`;
}

function analyzePatterns(closed) {
  const patterns = [];

  // Win rate by alert direction
  const byCondition = { above: [], below: [] };
  closed.forEach(t => {
    const al   = alerts.find(a => a.id === t.alertId);
    const cond = al ? al.condition : null;
    if (cond === 'above' || cond === 'below') byCondition[cond].push(t);
  });
  const { above: aboveTrades, below: belowTrades } = byCondition;
  if (aboveTrades.length >= 2 && belowTrades.length >= 2) {
    const aboveWR = Math.round(aboveTrades.filter(t => t.returnPct > 0).length / aboveTrades.length * 100);
    const belowWR = Math.round(belowTrades.filter(t => t.returnPct > 0).length / belowTrades.length * 100);
    if (Math.abs(aboveWR - belowWR) >= 20) {
      const better = aboveWR > belowWR ? 'above' : 'below';
      const betterWR = Math.max(aboveWR, belowWR), worseWR = Math.min(aboveWR, belowWR);
      patterns.push({
        type: betterWR >= 60 ? 'strength' : 'insight',
        title: `${better === 'above' ? 'Breakout' : 'Dip-buy'} trades are your edge`,
        value: `${betterWR}% win rate`,
        body: `Your ${better === 'above' ? 'breakout (above)' : 'dip-buy (below)'} alerts have a ${betterWR}% win rate vs ${worseWR}% on the other side. You consistently outperform when trading in your favored direction.`,
      });
    }
  }

  // Per-ticker performance
  const byTicker = {};
  closed.forEach(t => { if (!byTicker[t.ticker]) byTicker[t.ticker] = []; byTicker[t.ticker].push(t); });
  const tickerStats = Object.entries(byTicker)
    .filter(([, ts]) => ts.length >= 2)
    .map(([ticker, ts]) => ({
      ticker, count: ts.length,
      avg: ts.reduce((s, t) => s + t.returnPct, 0) / ts.length,
      wr:  Math.round(ts.filter(t => t.returnPct > 0).length / ts.length * 100),
    })).sort((a, b) => b.avg - a.avg);

  if (tickerStats.length >= 2) {
    const best  = tickerStats[0];
    const worst = tickerStats[tickerStats.length - 1];
    if (best.avg > 0)
      patterns.push({ type: 'strength', title: `${best.ticker} is your strongest ticker`, value: `${best.avg >= 0 ? '+' : ''}${best.avg.toFixed(1)}% avg`, body: `Across ${best.count} trades, ${best.ticker} has been your best performer with a ${best.wr}% win rate.` });
    if (worst.avg < 0)
      patterns.push({ type: 'warning', title: `${worst.ticker} is dragging your returns`, value: `${worst.avg.toFixed(1)}% avg`, body: `Your ${worst.ticker} trades average ${worst.avg.toFixed(1)}% — a ${worst.wr}% win rate across ${worst.count} trades. Consider waiting for higher-conviction setups.` });
  }

  // Note correlation
  const withNote    = closed.filter(t => t.note || t.alertNote);
  const withoutNote = closed.filter(t => !t.note && !t.alertNote);
  if (withNote.length >= 2 && withoutNote.length >= 2) {
    const noteWR   = Math.round(withNote.filter(t => t.returnPct > 0).length / withNote.length * 100);
    const noNoteWR = Math.round(withoutNote.filter(t => t.returnPct > 0).length / withoutNote.length * 100);
    if (noteWR - noNoteWR >= 15)
      patterns.push({ type: 'insight', title: 'Written thesis = better results', value: `${noteWR}% vs ${noNoteWR}%`, body: `Trades where you wrote a note have a ${noteWR}% win rate vs ${noNoteWR}% without. Keep using it.` });
    else if (noNoteWR - noteWR >= 15)
      patterns.push({ type: 'insight', title: 'Your instinct-based trades outperform', value: `${noNoteWR}% vs ${noteWR}%`, body: `Trades without a written thesis have a ${noNoteWR}% win rate vs ${noteWR}% with one. Trust the read.` });
  }

  // Recent trend vs historical
  if (closed.length >= 6) {
    const recent    = closed.slice(-5);
    const historical = closed.slice(0, -5);
    const recentAvg = recent.reduce((s, t) => s + t.returnPct, 0) / recent.length;
    const histAvg   = historical.reduce((s, t) => s + t.returnPct, 0) / historical.length;
    if (recentAvg - histAvg >= 2)
      patterns.push({ type: 'strength', title: "You're on a hot streak", value: `${recentAvg >= 0 ? '+' : ''}${recentAvg.toFixed(1)}% recent avg`, body: `Your last 5 trades averaged ${recentAvg >= 0 ? '+' : ''}${recentAvg.toFixed(1)}% vs your historical ${histAvg >= 0 ? '+' : ''}${histAvg.toFixed(1)}%.` });
    else if (histAvg - recentAvg >= 2)
      patterns.push({ type: 'warning', title: 'Recent performance is below your baseline', value: `${recentAvg.toFixed(1)}% recent avg`, body: `Your last 5 trades averaged ${recentAvg.toFixed(1)}% vs your historical ${histAvg >= 0 ? '+' : ''}${histAvg.toFixed(1)}%.` });
  }

  // Loss streak
  let streak = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    if (closed[i].returnPct < 0) streak++;
    else break;
  }
  if (streak >= 3)
    patterns.push({ type: 'danger', title: `${streak}-trade losing streak`, value: `${streak} consecutive losses`, body: `Your last ${streak} trades have all been losers. Step back, review the setups, and only enter your highest-conviction ideas.` });

  // Reward:risk ratio
  const winsList = closed.filter(t => t.returnPct > 0);
  const lossList = closed.filter(t => t.returnPct < 0);
  if (winsList.length >= 2 && lossList.length >= 2) {
    const avgWin  = winsList.reduce((s, t) => s + t.returnPct, 0) / winsList.length;
    const avgLoss = Math.abs(lossList.reduce((s, t) => s + t.returnPct, 0) / lossList.length);
    const ratio   = avgWin / avgLoss;
    if (ratio >= 2)
      patterns.push({ type: 'strength', title: 'Excellent reward-to-risk ratio', value: `${ratio.toFixed(1)}:1 R:R`, body: `Your average win (+${avgWin.toFixed(1)}%) is ${ratio.toFixed(1)}x your average loss (−${avgLoss.toFixed(1)}%). Even at a sub-50% win rate, this math works in your favor.` });
    else if (ratio < 0.75)
      patterns.push({ type: 'danger', title: 'Losses are outpacing wins in size', value: `${ratio.toFixed(1)}:1 R:R`, body: `Your average loss (−${avgLoss.toFixed(1)}%) is larger than your average win (+${avgWin.toFixed(1)}%). Cut losses faster.` });
  }

  return patterns;
}

function patternCardHTML(p) {
  const icons = {
    strength: `<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    warning:  `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    danger:   `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    insight:  `<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  };
  return `
    <div class="pattern-card ${p.type}">
      <div class="pattern-card-header">
        <div class="pattern-icon ${p.type}">${icons[p.type]}</div>
        <div class="pattern-meta">
          <div class="pattern-title">${p.title}</div>
          <div class="pattern-value ${p.type}">${p.value}</div>
        </div>
      </div>
      <p class="pattern-body">${p.body}</p>
    </div>`;
}

function generateRecommendations(patterns, closed, winRate, avgRet) {
  const recs = [];
  patterns.forEach(p => {
    if (p.type === 'danger' && p.title.includes('losing streak'))
      recs.push({ type: 'danger', text: 'Pause and review before your next trade — streaks often continue until you change something in your process.' });
    if (p.type === 'danger' && p.title.includes('outpacing'))
      recs.push({ type: 'danger', text: 'Set a hard stop-loss rule before entering any trade. Knowing your exit before you enter is the fastest way to improve this ratio.' });
    if (p.type === 'warning' && p.title.includes('dragging'))
      recs.push({ type: 'warning', text: `Consider reducing position size or requiring more confirmation before entering ${p.title.split(' ')[0]} trades.` });
    if (p.type === 'warning' && p.title.includes('below your baseline'))
      recs.push({ type: 'warning', text: 'Review your last 5 trade notes — look for a pattern in what changed: market conditions, entry timing, or position size.' });
    if (p.type === 'strength' && p.title.includes('edge'))
      recs.push({ type: 'strength', text: `Lean into your ${p.title.includes('Breakout') ? 'breakout (above)' : 'dip-buy (below)'} setups — that is where your statistical edge lives.` });
    if (p.type === 'insight' && p.title.includes('Written thesis'))
      recs.push({ type: 'insight', text: 'Always add a note when setting an alert. Your data shows trading with a written thesis produces measurably better outcomes.' });
  });
  if (winRate >= 60 && avgRet > 0)
    recs.push({ type: 'strength', text: `With a ${winRate}% win rate and a positive average return, your core process is working. Focus on consistency.` });
  if (winRate < 40)
    recs.push({ type: 'warning', text: 'A sub-40% win rate suggests your entry criteria need tightening. Try requiring at least two confirming signals before acting on an alert.' });
  if (closed.length < 5)
    recs.push({ type: 'insight', text: "Log more trades with exit prices to unlock deeper pattern analysis. You're building the dataset that will reveal your true edge." });
  return recs;
}

function recentTradeRowHTML(t) {
  const al      = alerts.find(a => a.id === t.alertId);
  const condText = al ? (al.condition === 'below' ? '↓ Below' : '↑ Above') : '—';
  const retCls  = t.returnPct >= 0 ? 'pos' : 'neg';
  return `
    <div class="rt-row">
      <span class="rt-ticker">${t.ticker}</span>
      <span class="rt-cond">${condText}</span>
      <span>$${t.entryPrice.toFixed(2)}</span>
      <span>$${t.exitPrice.toFixed(2)}</span>
      <span class="rt-return ${retCls}">${(t.returnPct >= 0 ? '+' : '') + t.returnPct.toFixed(1)}%</span>
    </div>`;
}

function renderTradesChart(closed) {
  const canvas = document.getElementById('trades-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const recent = [...closed].slice(-15);
  const colors = recent.map(t => t.returnPct >= 0 ? 'rgba(22,163,74,0.85)' : 'rgba(220,38,38,0.85)');

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: recent.map(t => t.ticker),
      datasets: [{ label: 'Return %', data: recent.map(t => t.returnPct), backgroundColor: colors, borderRadius: 5, borderSkipped: false }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(1)}%` } },
      },
      scales: {
        x: { ticks: { font: { size: 11 }, color: '#64748b' }, grid: { display: false } },
        y: {
          ticks: { font: { size: 11 }, color: '#94a3b8', callback: v => v + '%' },
          grid: { color: '#1e293b' }, border: { dash: [4, 4] },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════
function renderSettings() {
  const nameEl = document.getElementById('profile-name-val');
  if (nameEl) nameEl.textContent = userName || 'Not set';

  const geminiInp = document.getElementById('settings-gemini-key');
  if (geminiInp) geminiInp.value = geminiKey;
  const geminiDesc = document.getElementById('settings-gemini-desc');
  if (geminiDesc) geminiDesc.textContent = geminiKey ? 'Connected — AI chat active' : 'Free at aistudio.google.com — powers the chat assistant';

  const finnhubInp = document.getElementById('settings-api-key');
  if (finnhubInp) finnhubInp.value = finnhubKey;
  const finnhubDesc = document.getElementById('settings-key-desc');
  if (finnhubDesc) finnhubDesc.textContent = finnhubKey ? 'Connected — live prices and news active' : 'Free at finnhub.io — powers real-time stock news';
}

function saveGeminiKey() {
  const val = (document.getElementById('settings-gemini-key').value || '').trim();
  geminiKey = val;
  _activeModel = null;
  localStorage.removeItem('tn-gemini-model');
  if (val) localStorage.setItem('tn-gemini-key', val);
  else localStorage.removeItem('tn-gemini-key');
  renderSettings();
}

function saveSettingsApiKey() {
  const val = (document.getElementById('settings-api-key').value || '').trim();
  finnhubKey = val;
  if (val) localStorage.setItem('tn-finnhub-key', val);
  else localStorage.removeItem('tn-finnhub-key');
  lastNewsFetch = 0;
  renderSettings();
}

function resetName() {
  if (!confirm("Reset your name?")) return;
  userName = null;
  localStorage.removeItem('tn-name');
  renderSettings();
}

function clearAlerts() {
  if (!confirm('Remove all alerts and trade history?')) return;
  alerts = []; trades = [];
  saveAlerts(); saveTrades();
  renderNotebook();
}

function resetAll() {
  if (!confirm('Wipe all data and start fresh?')) return;
  localStorage.clear();
  location.reload();
}

// ═══════════════════════════════════════════════════════
// VOICE INPUT
// ═══════════════════════════════════════════════════════
let recognition = null;
let isListening = false;

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = false; r.interimResults = true; r.lang = 'en-US';
  r.onstart  = () => { document.getElementById('mic-btn').classList.add('listening'); chatTa.placeholder = 'Listening…'; };
  r.onresult = (e) => {
    const transcript = Array.from(e.results).map(x => x[0].transcript).join('');
    chatTa.value = transcript;
    chatTa.style.height = 'auto';
    chatTa.style.height = Math.min(chatTa.scrollHeight, 160) + 'px';
  };
  r.onend = () => {
    isListening = false;
    document.getElementById('mic-btn').classList.remove('listening');
    chatTa.placeholder = 'Set an alert, log a trade, or ask anything…';
    if (chatTa.value.trim()) sendMessage();
  };
  r.onerror = (e) => {
    isListening = false;
    document.getElementById('mic-btn').classList.remove('listening');
    chatTa.placeholder = 'Set an alert, log a trade, or ask anything…';
    if (e.error !== 'no-speech' && e.error !== 'aborted')
      addMsg(`Voice error: ${e.error}. Make sure your microphone is allowed.`, 'ai');
  };
  return r;
}

function toggleListening() {
  if (isListening) {
    isListening = false;
    if (recognition) recognition.stop();
  } else {
    if (!recognition) recognition = initSpeech();
    if (!recognition) { addMsg('Voice input requires Chrome or Edge.', 'ai'); return; }
    isListening = true;
    try { recognition.start(); } catch(e) {}
  }
}

// ═══════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════
function refreshLandingContent() {
  const greetingEl = document.getElementById('landing-greeting');
  const subEl      = document.getElementById('landing-sub');
  if (!greetingEl || !subEl) return;

  greetingEl.textContent = userName ? `Welcome back, ${userName}` : 'tradrNotebook';
  const active    = alerts.filter(a => a.status === 'active').length;
  const triggered = alerts.filter(a => a.status === 'triggered').length;

  if (triggered > 0)
    subEl.textContent = `${triggered} alert${triggered > 1 ? 's' : ''} triggered — check your Notebook.`;
  else if (active > 0)
    subEl.textContent = `You have ${active} active alert${active > 1 ? 's' : ''} running.`;
  else
    subEl.textContent = 'Track setups, log trades, and keep every decision in one place.';
}

window.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.logoStyle = 'shared-stem';
  refreshLandingContent();

  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Restore chat messages from this session
  if (chatLog.length) {
    chatLog.forEach(m => {
      const group  = document.createElement('div');
      group.className = 'msg-group';
      const row    = document.createElement('div');
      row.className = 'msg-row ' + m.role;
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble ' + m.role;
      if (m.html) bubble.innerHTML = m.text;
      else bubble.textContent = m.text;
      row.appendChild(bubble);
      group.appendChild(row);
      chatInner.appendChild(group);
    });
    viewChat.classList.add('has-messages');
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  if (finnhubKey && alerts.filter(a => a.status === 'active').length) {
    setTimeout(checkAndTriggerAlerts, 3000);
    setInterval(checkAndTriggerAlerts, 5 * 60 * 1000);
  }
});