require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const ALLOWED_ORIGINS = [
  "https://orbi-food.com",
  "https://www.orbi-food.com",
  "https://grand-raindrop-d23326.netlify.app",
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS not allowed: " + origin));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ให้ OPTIONS ผ่านทุก route ชัวร์ ๆ
app.options("*", cors());

app.use(express.json());


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


function signAdminToken() {
  return jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function adminOnly(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ---------------------------
   Admin login (password only)
---------------------------- */
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "password required" });
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: "wrong password" });
  res.json({ token: signAdminToken() });
});

/* ---------------------------
   Public endpoints + Cache (แนะนำ)
---------------------------- */
app.get("/api/public/categories", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=60"); // ✅ cache 60s
  const { rows } = await pool.query("select id, name, icon from categories order by id asc");
  res.json({ categories: rows });
});

app.get("/api/public/shops", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=60"); // ✅ cache 60s
  const { rows } = await pool.query(`
    select
      id,
      name,
      currency,
      category_id as "categoryId",
      province_id as "provinceId",
      district_id as "districtId",
      village_id as "villageId",
      has_delivery as "hasDelivery",
      pickup,
      delivery_fee as "deliveryFee",
      min_order as "minOrder",
      eta_min as "etaMin",
      hours,
      rating,
      orders,
      created_at as "createdAt",
      cover,
      messenger_url as "messengerUrl",
      tags,
      featured,
      active,
      map_url as "mapUrl",
      lat, lng,
      menu_image as "menuImage"
    from shops
    order by featured desc, orders desc nulls last
  `);
  res.json({ shops: rows });
});

app.get("/api/public/zones", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=300"); // zones เปลี่ยนน้อยกว่า ให้ cache นานขึ้นได้
  const { rows } = await pool.query("select data from zones where id='laos' limit 1");
  const data = rows[0]?.data || { zones: [] };
  res.json(data);
});

app.get("/api/public/menus/:shopId", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60"); // ✅ cache 60s
  const shopId = req.params.shopId;
  const { rows } = await pool.query(
    `select id, shop_id as "shopId", name, price, currency, image, available, sort
     from menu_items
     where shop_id=$1
     order by sort asc, name asc`,
    [shopId]
  );
  res.json(rows);
});

/* ---------------------------
   Admin CRUD: Shops
---------------------------- */
app.post("/api/admin/shops", adminOnly, async (req, res) => {
  const s = req.body || {};
  if (!s.id || !s.name) return res.status(400).json({ error: "id and name required" });

  await pool.query(
    `insert into shops (
      id, name, currency, category_id, province_id, district_id, village_id,
      has_delivery, pickup, delivery_fee, min_order, eta_min, hours, rating, orders,
      created_at, cover, messenger_url, tags, featured, active, map_url, lat, lng, menu_image
    ) values (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,$21,$22,$23,$24,$25
    )`,
    [
      s.id, s.name, s.currency || "THB", s.categoryId || null, s.provinceId || null, s.districtId || null, s.villageId || null,
      !!s.hasDelivery, (typeof s.pickup === "boolean") ? s.pickup : true, Number(s.deliveryFee || 0), Number(s.minOrder || 0),
      Number(s.etaMin || 0), s.hours || null, Number(s.rating || 0), Number(s.orders || 0),
      s.createdAt || null, s.cover || null, s.messengerUrl || null, JSON.stringify(s.tags || []),
      !!s.featured, (typeof s.active === "boolean") ? s.active : true, s.mapUrl || null,
      (s.lat != null ? Number(s.lat) : null), (s.lng != null ? Number(s.lng) : null), s.menuImage || null
    ]
  );

  res.json({ ok: true });
});

app.put("/api/admin/shops/:id", adminOnly, async (req, res) => {
  const id = req.params.id;
  const s = req.body || {};
  await pool.query(
    `update shops set
      name=$2, currency=$3, category_id=$4,
      province_id=$5, district_id=$6, village_id=$7,
      has_delivery=$8, pickup=$9,
      delivery_fee=$10, min_order=$11, eta_min=$12,
      hours=$13, rating=$14, orders=$15,
      created_at=$16, cover=$17, messenger_url=$18,
      tags=$19, featured=$20, active=$21,
      map_url=$22, lat=$23, lng=$24, menu_image=$25
     where id=$1`,
    [
      id,
      s.name, s.currency, s.categoryId,
      s.provinceId, s.districtId, s.villageId,
      !!s.hasDelivery, !!s.pickup,
      Number(s.deliveryFee || 0), Number(s.minOrder || 0), Number(s.etaMin || 0),
      s.hours, Number(s.rating || 0), Number(s.orders || 0),
      s.createdAt || null, s.cover || null, s.messengerUrl || null,
      JSON.stringify(s.tags || []), !!s.featured, !!s.active,
      s.mapUrl || null, (s.lat != null ? Number(s.lat) : null), (s.lng != null ? Number(s.lng) : null), s.menuImage || null
    ]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/shops/:id", adminOnly, async (req, res) => {
  await pool.query("delete from shops where id=$1", [req.params.id]);
  res.json({ ok: true });
});

/* ---------------------------
   Admin CRUD: Menu Items
---------------------------- */
app.post("/api/admin/menus/:shopId", adminOnly, async (req, res) => {
  const shopId = req.params.shopId;
  const m = req.body || {};
  if (!m.id || !m.name) return res.status(400).json({ error: "id and name required" });

  await pool.query(
    `insert into menu_items (id, shop_id, name, price, currency, image, available, sort)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [m.id, shopId, m.name, Number(m.price || 0), m.currency || null, m.image || null, m.available !== false, Number(m.sort || 0)]
  );
  res.json({ ok: true });
});

app.put("/api/admin/menus/:shopId/:menuId", adminOnly, async (req, res) => {
  const { shopId, menuId } = req.params;
  const m = req.body || {};
  await pool.query(
    `update menu_items set name=$3, price=$4, currency=$5, image=$6, available=$7, sort=$8
     where id=$1 and shop_id=$2`,
    [menuId, shopId, m.name, Number(m.price || 0), m.currency || null, m.image || null, m.available !== false, Number(m.sort || 0)]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/menus/:shopId/:menuId", adminOnly, async (req, res) => {
  const { shopId, menuId } = req.params;
  await pool.query("delete from menu_items where id=$1 and shop_id=$2", [menuId, shopId]);
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ✅ listen แค่ครั้งเดียว
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 API running on port", PORT);
});
