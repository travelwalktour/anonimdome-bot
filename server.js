const BOT_TOKEN = "8328287232:AAENQ6M4AkTXIWOu1gHgELXTzgsnoMVhRz0";
const WEBAPP_URL = "https://meek-gumption-a2aa0f.netlify.app";
const GMAIL_USER = "sportstreams88@gmail.com";
const GMAIL_PASS = "ajjk vbje cnkm mfel";
const CRYPTOBOT_TOKEN = "ВСТАВЬ_ТОКЕН_CRYPTOBOT";
const SBP_PHONE = "+7 991 967 87 07";
const ADMIN_CHAT_ID = "1696206120";
const PORKBUN_API_KEY = "pk1_0bfa747fb6cbd608dbd9d292000d7c6e5f07cbb45d580ed3c3ddc8cc9b337088";
const PORKBUN_SECRET = "sk1_3915fbe58f1a6a08062e6d8f0ee2143229e54a66544bff875e932a03a221805f";

// Резервные цены если Porkbun API не отвечает
const FALLBACK_PRICES = {
  com:    { registration: 9.73,  renewal: 13.98 },
  net:    { registration: 11.98, renewal: 13.98 },
  org:    { registration: 9.93,  renewal: 13.98 },
  ru:     { registration: 1.50,  renewal: 1.50  },
  io:     { registration: 39.99, renewal: 43.99 },
  ai:     { registration: 64.99, renewal: 69.99 },
  app:    { registration: 13.99, renewal: 15.99 },
  xyz:    { registration: 2.99,  renewal: 4.99  },
  biz:    { registration: 9.99,  renewal: 13.99 },
  pro:    { registration: 9.99,  renewal: 13.99 },
  online: { registration: 3.99,  renewal: 5.99  },
  site:   { registration: 3.99,  renewal: 5.99  },
  store:  { registration: 5.99,  renewal: 7.99  },
  club:   { registration: 4.99,  renewal: 6.99  },
  me:     { registration: 9.99,  renewal: 13.99 },
  dev:    { registration: 13.99, renewal: 15.99 },
  info:   { registration: 3.99,  renewal: 5.99  },
  shop:   { registration: 5.99,  renewal: 7.99  },
  vip:    { registration: 9.99,  renewal: 13.99 },
};

const MARKUP = 1.3; // наценка 30%

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") res.sendStatus(200);
  else next();
});
app.use(express.static("public"));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const users = {};
const pending = {};

function getUser(id) {
  if (!users[id]) users[id] = { balance: 0, email: null, orders: [], transactions: [] };
  return users[id];
}

// Получить цены от Porkbun, при ошибке — резервные
async function getPrices() {
  try {
    const r = await fetch("https://porkbun.com/api/json/v3/pricing/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: PORKBUN_API_KEY, secretapikey: PORKBUN_SECRET }),
      timeout: 5000
    });
    const d = await r.json();
    if (d.status === "SUCCESS" && d.pricing) {
      console.log("✅ Porkbun цены получены");
      return d.pricing;
    }
    console.log("⚠️ Porkbun вернул ошибку, используем резервные цены");
    return null;
  } catch (e) {
    console.log("⚠️ Porkbun недоступен, используем резервные цены:", e.message);
    return null;
  }
}

// Проверка доступности домена
async function checkAvailable(domain) {
  try {
    const r = await fetch(`https://rdap.org/domain/${domain}`, { timeout: 4000 });
    return r.status === 404;
  } catch (e) {
    return null;
  }
}

bot.onText(/\/start/, async (msg) => {
  getUser(msg.chat.id);
  await bot.sendMessage(
    msg.chat.id,
    "👋 *Добро пожаловать в AnonimDomen!*\n\n• 🔍 Поиск доменов всех зон мира\n• ✅ Проверка доступности\n• 💳 Оплата: Crypto Bot",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🚀 Открыть AnonimDomen", web_app: { url: WEBAPP_URL } }]]
      }
    }
  );
});

app.post("/api/balance", (req, res) => {
  const u = getUser(req.body.chatId);
  res.json({ balance: u.balance, email: u.email });
});

app.post("/api/search", async (req, res) => {
  const clean = (req.body.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/\..*/g, "")
    .trim();

  if (!clean) return res.json({ error: "Некорректное имя домена" });

  // Получаем цены
  const porkbunPrices = await getPrices();

  const tlds = ["com","net","org","ru","io","app","ai","vip","xyz","biz","pro","online","site","store","club","me","dev","info","shop"];
  const results = [];

  await Promise.allSettled(
    tlds.map(async (tld) => {
      const domain = `${clean}.${tld}`;

      // Берём цену: сначала Porkbun, затем резервная
      let regPrice = null;
      let renewPrice = null;

      if (porkbunPrices && porkbunPrices[tld]) {
        const p = porkbunPrices[tld];
        const regRaw = parseFloat(p.registration || p.regular || p.price || 0);
        const renewRaw = parseFloat(p.renewal || p.regular || p.price || 0);
        if (regRaw > 0) {
          regPrice = parseFloat((regRaw * MARKUP).toFixed(2));
          renewPrice = parseFloat((renewRaw * MARKUP).toFixed(2));
        }
      }

      // Если Porkbun не дал цену — берём резервную
      if (!regPrice && FALLBACK_PRICES[tld]) {
        regPrice = parseFloat((FALLBACK_PRICES[tld].registration * MARKUP).toFixed(2));
        renewPrice = parseFloat((FALLBACK_PRICES[tld].renewal * MARKUP).toFixed(2));
      }

      // Проверяем доступность
      const available = await checkAvailable(domain);

      // Добавляем всегда — даже если цена резервная
      results.push({ domain, tld, available, regPrice, renewPrice });
    })
  );

  // Сортировка: доступные сначала, затем по цене
  results.sort((a, b) => {
    if (a.available && !b.available) return -1;
    if (!a.available && b.available) return 1;
    return (a.regPrice || 999) - (b.regPrice || 999);
  });

  res.json({ results });
});

app.post("/api/deposit/crypto", async (req, res) => {
  const { chatId, amount } = req.body;
  if (!amount || amount < 1) return res.json({ error: "Минимум $1" });
  try {
    const r = await fetch("https://pay.crypt.bot/api/createInvoice", {
      method: "POST",
      headers: { "Crypto-Pay-API-Token": CRYPTOBOT_TOKEN },
      body: JSON.stringify({ asset: "USDT", amount, description: "Пополнение AnonimDomen", payload: String(chatId) })
    });
    const d = await r.json();
    if (d.ok) {
      pending[d.result.invoice_id] = { chatId, amount: parseFloat(amount) };
      return res.json({ ok: true, url: d.result.pay_url, invoiceId: d.result.invoice_id });
    }
    res.json({ error: "Ошибка CryptoBot" });
  } catch (e) {
    res.json({ error: "Ошибка соединения" });
  }
});

app.post("/api/deposit/sbp", (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 1) return res.json({ error: "Минимум $1" });
  res.json({ ok: true, phone: SBP_PHONE, rub: Math.ceil(amount * 92), usd: amount });
});

app.post("/api/deposit/sbp/confirm", async (req, res) => {
  const { chatId, amount } = req.body;
  try {
    await bot.sendMessage(ADMIN_CHAT_ID, `💳 СБП пополнение\nПользователь: ${chatId}\nСумма: ${Math.ceil(amount * 92)} ₽`);
  } catch (e) {}
  res.json({ ok: true });
});

app.post("/api/check-payment", async (req, res) => {
  const p = pending[req.body.invoiceId];
  if (!p) return res.json({ status: "not_found" });
  try {
    const r = await fetch(`https://pay.crypt.bot/api/getInvoices?invoice_ids=${req.body.invoiceId}`, {
      headers: { "Crypto-Pay-API-Token": CRYPTOBOT_TOKEN }
    });
    const d = await r.json();
    if (d.ok && d.result.items[0]?.status === "paid") {
      const u = getUser(p.chatId);
      u.balance += p.amount;
      u.transactions.push({ type: "deposit", amount: p.amount, date: new Date() });
      try { await bot.sendMessage(p.chatId, `✅ Баланс пополнен на $${p.amount}!`); } catch (e) {}
      return res.json({ status: "paid", balance: u.balance });
    }
    res.json({ status: "pending" });
  } catch (e) {
    res.json({ status: "pending" });
  }
});

app.post("/api/order", async (req, res) => {
  const { chatId, domains, total, email } = req.body;
  const u = getUser(chatId);
  const t = parseFloat(total);
  if (u.balance < t) return res.json({ error: "insufficient" });
  if (email) u.email = email;
  u.balance -= t;
  const names = domains.map((d) => d.domain);
  u.orders.push(...names);
  u.transactions.push({ type: "order", amount: -t, date: new Date().toLocaleDateString("ru-RU") });
  try {
    const tr = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
    await tr.sendMail({
      from: GMAIL_USER, to: GMAIL_USER,
      subject: `🌐 Новый заказ: ${names.join(", ")}`,
      html: `<h2>Новый заказ!</h2><p>Домены: ${names.join(", ")}</p><p>Сумма: $${t}</p><p>Email: ${email}</p><p>ChatID: ${chatId}</p>`
    });
    await bot.sendMessage(chatId, `🎉 Заказ оформлен!\n\n${names.join(", ")}\nСумма: $${t}\nОстаток: $${u.balance.toFixed(2)}`);
  } catch (e) {}
  res.json({ ok: true, balance: u.balance });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
