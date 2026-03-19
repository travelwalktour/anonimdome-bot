const BOT_TOKEN = "8328287232:AAENQ6M4AkTXIWOu1gHgELXTzgsnoMVhRz0";
const WEBAPP_URL = "https://meek-gumption-a2aa0f.netlify.app";
const GMAIL_USER     = "sportstreams88@gmail.com";
const GMAIL_PASS     = "ajjk vbje cnkm mfel";
const CRYPTOBOT_TOKEN = "ВСТАВЬ_ТОКЕН_CRYPTOBOT";
const SBP_PHONE      = "+7 991 967 87 07";
const ADMIN_CHAT_ID  = "1696206120";

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use((req,res,next)=>{res.header('Access-Control-Allow-Origin','*');res.header('Access-Control-Allow-Headers','*');if(req.method==='OPTIONS'){res.sendStatus(200);}else{next();}});
app.use(express.static("public"));
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const users = {};
const pending = {};

function getUser(id) {
  if (!users[id]) users[id] = { balance:0, email:null, orders:[], transactions:[] };
  return users[id];
}

bot.onText(/\/start/, async (msg) => {
  getUser(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    "👋 *Добро пожаловать в AnonimDomen!*\n\n• 🔍 Поиск доменов всех зон мира\n• ✅ Проверка доступности\n• 💳 Оплата: Crypto Bot",
    { parse_mode:"Markdown", reply_markup:{ inline_keyboard:[[{ text:"🚀 Открыть AnonimDomen", web_app:{ url:WEBAPP_URL }}]] } }
  );
});

app.post("/api/balance", (req,res) => {
  const u = getUser(req.body.chatId);
  res.json({ balance:u.balance, email:u.email });
});

app.post("/api/search", async (req,res) => {
  const clean = (req.body.name||"").toLowerCase().replace(/[^a-z0-9-]/g,"").replace(/\..*/,"");
  if (!clean) return res.json({ error:"Некорректное имя" });
  let prices = {};
  try { const r=await fetch("https://porkbun.com/api/json/v3/pricing/get",{method:"POST"}); const d=await r.json(); if(d.status==="SUCCESS") prices=d.pricing; } catch(e){}
  const tlds = ["com","net","org","ru","io","app","ai","vip","xyz","biz","pro","online","site","store","club","me","dev","info","shop"];
  const results = [];
  await Promise.allSettled(tlds.map(async tld => {
    const domain=`${clean}.${tld}`; let available=null;
    try { const r=await fetch(`https://rdap.org/domain/${domain}`); available=r.status===404; } catch(e){}
    const p=prices[tld]; const reg=p?parseFloat((parseFloat(p.registration||p.regular||0)*1.3).toFixed(2)):null;
    const renew=p?parseFloat((parseFloat(p.renewal||p.regular||0)*1.3).toFixed(2)):null;
    if(reg) results.push({domain,tld,available,regPrice:reg,renewPrice:renew});
  }));
  results.sort((a,b)=>{ if(a.available&&!b.available)return -1; if(!a.available&&b.available)return 1; return a.regPrice-b.regPrice; });
  res.json({ results:results.slice(0,20) });
});

app.post("/api/deposit/crypto", async (req,res) => {
  const {chatId,amount}=req.body;
  if(!amount||amount<1) return res.json({error:"Минимум $1"});
  try {
    const r=await fetch("https://pay.crypt.bot/api/createInvoice",{method:"POST",headers:{"Crypto-Pay-API-Token":CRYPTOBOT_TOKEN},body:JSON.stringify({asset:"USDT",amount,description:"Пополнение AnonimDomen",payload:String(chatId)})});
    const d=await r.json();
    if(d.ok){ pending[d.result.invoice_id]={chatId,amount:parseFloat(amount)}; return res.json({ok:true,url:d.result.pay_url,invoiceId:d.result.invoice_id}); }
    res.json({error:"Ошибка CryptoBot"});
  } catch(e){ res.json({error:"Ошибка соединения"}); }
});

app.post("/api/deposit/sbp",(req,res)=>{
  const {amount}=req.body;
  if(!amount||amount<1) return res.json({error:"Минимум $1"});
  res.json({ok:true,phone:SBP_PHONE,rub:Math.ceil(amount*92),usd:amount});
});

app.post("/api/deposit/sbp/confirm", async (req,res)=>{
  const {chatId,amount}=req.body;
  try { await bot.sendMessage(ADMIN_CHAT_ID, `💳 СБП пополнение\nПользователь: ${chatId}\nСумма: ${Math.ceil(amount*92)} ₽`); } catch(e){}
  res.json({ok:true});
});

app.post("/api/check-payment", async (req,res)=>{
  const p=pending[req.body.invoiceId];
  if(!p) return res.json({status:"not_found"});
  try {
    const r=await fetch(`https://pay.crypt.bot/api/getInvoices?invoice_ids=${req.body.invoiceId}`,{headers:{"Crypto-Pay-API-Token":CRYPTOBOT_TOKEN}});
    const d=await r.json();
    if(d.ok&&d.result.items[0]?.status==="paid"){
      const u=getUser(p.chatId); u.balance+=p.amount; u.transactions.push({type:"deposit",amount:p.amount,date:new Date()});
      try { await bot.sendMessage(p.chatId, `✅ Баланс пополнен на $${p.amount}!`); } catch(e){}
      return res.json({status:"paid",balance:u.balance});
    }
    res.json({status:"pending"});
  } catch(e){ res.json({status:"pending"}); }
});

app.post("/api/order", async (req,res)=>{
  const {chatId,domains,total,email}=req.body; const u=getUser(chatId); const t=parseFloat(total);
  if(u.balance<t) return res.json({error:"insufficient"});
  if(email) u.email=email; u.balance-=t;
  const names=domains.map(d=>d.domain); u.orders.push(...names);
  u.transactions.push({type:"order",amount:-t,date:new Date().toLocaleDateString("ru-RU")});
  try {
    const tr=nodemailer.createTransport({service:"gmail",auth:{user:GMAIL_USER,pass:GMAIL_PASS}});
    await tr.sendMail({from:GMAIL_USER,to:GMAIL_USER,subject:`🌐 Новый заказ: ${names.join(", ")}`,html:`<h2>Новый заказ!</h2><p>Домены: ${names.join(", ")}</p><p>Сумма: $${t}</p><p>Email: ${email}</p><p>ChatID: ${chatId}</p>`});
    await bot.sendMessage(chatId, `🎉 Заказ оформлен!\n\n${names.join(", ")}\nСумма: $${t}\nОстаток: $${u.balance.toFixed(2)}`);
  } catch(e){}
  res.json({ok:true,balance:u.balance});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
