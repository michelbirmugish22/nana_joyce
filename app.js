import express from "express";
import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let db;

// 📂 Initialisation de la base SQLite
const initDb = async () => {
  db = await open({
    filename: "./database.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  console.log("✅ Base SQLite initialisée");
};

initDb();

// 🔹 Inscription
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ message: "Champs manquants" });

  try {
    const hashed = await bcrypt.hash(password, 10);
    await db.run(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashed]
    );
    res.json({ message: "Compte créé avec succès !" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur : email déjà utilisé ?" });
  }
});

// 🔹 Connexion
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) return res.status(400).json({ message: "Utilisateur non trouvé" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid)
    return res.status(401).json({ message: "Mot de passe incorrect" });

  res.json({
    message: "Connexion réussie",
    userId: user.id,
    username: user.username,
  });
});

// 🔹 Liste des utilisateurs + leurs produits
app.get("/api/users", async (req, res) => {
  const rows = await db.all(`
    SELECT u.id, u.username, u.email, p.name AS product_name, p.description
    FROM users u
    LEFT JOIN products p ON u.id = p.user_id
  `);
  res.json(rows);
});

// 🔹 Ajout d’un produit
app.post("/api/products", async (req, res) => {
  const { userId, name, description } = req.body;
  if (!userId || !name)
    return res.status(400).json({ message: "Champs manquants" });

  await db.run(
    "INSERT INTO products (user_id, name, description) VALUES (?, ?, ?)",
    [userId, name, description]
  );
  res.json({ message: "Produit ajouté" });
});

app.get("/api/currentUser", (req, res) => {
  if (req.session.user) {
    res.json({ username: req.session.user.username });
  } else {
    res.json({});
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Erreur logout");
    res.sendStatus(200);
  });
});

// 🚀 Lancer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`)
);
