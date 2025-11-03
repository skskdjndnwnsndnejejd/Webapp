// === 🎁 PortHub — Telegram Mini-App backend ===
// Node.js + Express + Supabase backend
// Автор: PortHub Dev Team

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// --- Инициализация Express ---
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Подключение Supabase ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID;

// === 🧠 API ROUTES ===

// Проверка доступности
app.get("/api/ping", (req, res) => {
  res.json({ status: "ok", message: "PortHub backend is running." });
});

// --- Регистрация / Авторизация пользователя через Telegram initData ---
app.post("/api/auth", async (req, res) => {
  try {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ error: "No telegram_id provided" });

    // Проверяем, есть ли пользователь
    const { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", telegram_id)
      .single();

    if (existing) {
      res.json({ user: existing });
    } else {
      const { data, error } = await supabase
        .from("users")
        .insert([{ telegram_id, username, balance: 0 }])
        .select()
        .single();
      if (error) throw error;
      res.json({ user: data });
    }
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Получение баланса пользователя ---
app.get("/api/balance/:telegram_id", async (req, res) => {
  try {
    const { telegram_id } = req.params;
    const { data, error } = await supabase
      .from("users")
      .select("balance")
      .eq("telegram_id", telegram_id)
      .single();

    if (error) throw error;
    res.json({ balance: data.balance });
  } catch (err) {
    res.status(500).json({ error: "Cannot fetch balance" });
  }
});

// --- Выдача баланса (только владелец) ---
app.post("/api/admin/give", async (req, res) => {
  try {
    const { admin_id, target_id, amount } = req.body;
    if (admin_id != OWNER_TELEGRAM_ID)
      return res.status(403).json({ error: "Forbidden" });

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", target_id)
      .single();

    if (!user) return res.status(404).json({ error: "User not found" });

    const newBalance = Number(user.balance) + Number(amount);
    await supabase
      .from("users")
      .update({ balance: newBalance })
      .eq("telegram_id", target_id);

    res.json({ success: true, newBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error updating balance" });
  }
});

// --- Получение всех NFT товаров ---
app.get("/api/items", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("items")
      .select("*, users(username, telegram_id)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ items: data });
  } catch (err) {
    res.status(500).json({ error: "Cannot fetch items" });
  }
});

// --- Покупка NFT ---
app.post("/api/buy", async (req, res) => {
  const { buyer_tg, item_id } = req.body;
  try {
    // Получаем товар и покупателя
    const { data: item } = await supabase.from("items").select("*").eq("id", item_id).single();
    const { data: buyer } = await supabase.from("users").select("*").eq("telegram_id", buyer_tg).single();

    if (!item || !buyer) return res.status(404).json({ error: "Not found" });
    if (buyer.balance < item.price) return res.status(400).json({ error: "Недостаточно средств" });

    // Продавец
    const { data: seller } = await supabase.from("users").select("*").eq("id", item.owner_id).single();
    if (!seller) return res.status(404).json({ error: "Seller not found" });

    const commission = item.price * 0.02;
    const sellerGets = item.price - commission;

    // Обновляем балансы
    await supabase.from("users").update({ balance: buyer.balance - item.price }).eq("telegram_id", buyer_tg);
    await supabase.from("users").update({ balance: seller.balance + sellerGets }).eq("id", seller.id);

    // Записываем транзакцию
    await supabase.from("transactions").insert([{
      buyer_id: buyer.id,
      seller_id: seller.id,
      item_id: item.id,
      amount: item.price
    }]);

    // Передаём товар покупателю
    await supabase.from("items").update({ owner_id: buyer.id }).eq("id", item.id);

    res.json({ success: true, message: "Покупка успешна" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при покупке" });
  }
});

// --- Получение подарков пользователя ---
app.get("/api/gifts/:telegram_id", async (req, res) => {
  try {
    const { telegram_id } = req.params;
    const { data: user } = await supabase.from("users").select("id").eq("telegram_id", telegram_id).single();
    if (!user) return res.status(404).json({ error: "User not found" });

    const { data: gifts } = await supabase.from("gifts").select("*").eq("user_id", user.id);
    res.json({ gifts });
  } catch (err) {
    res.status(500).json({ error: "Cannot fetch gifts" });
  }
});

// --- Создание нового лота ---
app.post("/api/items/new", async (req, res) => {
  try {
    const { telegram_id, name, description, price, image, link } = req.body;

    const { data: user } = await supabase.from("users").select("*").eq("telegram_id", telegram_id).single();
    if (!user) return res.status(404).json({ error: "User not found" });

    const { error } = await supabase.from("items").insert([
      {
        name,
        description,
        price,
        owner_id: user.id,
        image,
        link
      }
    ]);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot create item" });
  }
});

// --- Фоллбэк для фронта ---
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Запуск ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎁 PortHub running on port ${PORT}`);
});
