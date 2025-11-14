import express from "express";
import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";

// Pour retrouver __dirname dans un module ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// S'assurer que le dossier uploads existe
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Garde le nom original, en le "sanitisant" pour éviter caractères problématiques
    const originalName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, originalName);
  },
});
const upload = multer({ storage });

dotenv.config();

const app = express();

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

import session from "express-session";
import SQLiteStore from "connect-sqlite3";

const SQLiteStoreSession = SQLiteStore(session);

// Middleware de session
app.use(
  session({
    store: new SQLiteStoreSession({ db: "sessions.db", dir: "./" }),
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1 jour
  })
);

let db;

// ===============================
// 📂 Initialisation de la base SQLite
// ===============================
const initDb = async () => {
  db = await open({
    filename: "./database.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
CREATE TABLE IF NOT EXISTS Faculte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  designation TEXT
);

CREATE TABLE IF NOT EXISTS Service (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  designation TEXT
);
CREATE TABLE IF NOT EXISTS Utilisateur (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT,
  postnom TEXT,
  sexe TEXT,
  datenaiss DATE,
  adresse TEXT,
  role TEXT,
  mail TEXT UNIQUE,
  password TEXT,
  photo TEXT,
  faculte_id INTEGER,
  service_id INTEGER,
  FOREIGN KEY (faculte_id) REFERENCES Faculte(id)
      ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (service_id) REFERENCES Service(id)
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Categorie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  designation TEXT,
  nom TEXT
);

CREATE TABLE IF NOT EXISTS Document (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT,
  code TEXT,
  url TEXT,
  date_created DATETIME,
  niveau_conf SMALLINT,
  categorie_id INTEGER,
  utilisateur_id INTEGER,
  FOREIGN KEY (categorie_id) REFERENCES Categorie(id)
      ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (utilisateur_id) REFERENCES Utilisateur(id)
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Rechercher (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resultat BOOLEAN,
  date DATETIME,
  utilisateur_id INTEGER,
  document_id INTEGER,
  FOREIGN KEY (utilisateur_id) REFERENCES Utilisateur(id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (document_id) REFERENCES Document(id)
      ON DELETE CASCADE ON UPDATE CASCADE
);
  `);

  console.log("✅ Base SQLite initialisée");
};
initDb();

// ===============================
// 🌐 ROUTES DES PAGES PUBLIQUES
// ===============================
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
);
app.get("/faculte", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "faculte.html"))
);
app.get("/inscription", (req, res) =>
  // res.sendFile(path.join(__dirname, "public", "inscription.html"))
  res.sendFile(path.join(__dirname, "public", "register.html"))
);
app.get("/recherche-documents", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "recherche.html"))
);
app.get("/historique", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "historique.html"))
);
app.get("/service", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "services.html"))
);
app.get("/utilisateur", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "utilisateur.html"))
);
app.get("/categorie", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "categorie.html"))
);
app.get("/document", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "document.html"))
);
app.get("/scan", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "numeriser.html"))
);
app.get("/rechercher", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "rechercher.html"))
);

// ===========================================================
// 🧍 AUTHENTIFICATION : INSCRIPTION + CONNEXION
// ===========================================================

// ➕ Inscription
app.post("/api/register", upload.single("photo"), async (req, res) => {
  try {
    const {
      nom,
      postnom,
      sexe,
      datenaiss,
      adresse,
      role,
      mail,
      password,
      faculte_id,
      service_id,
    } = req.body;
    const photo = req.file ? "/uploads/" + req.file.filename : null;

    if (!nom || !postnom || !mail || !password) {
      return res
        .status(400)
        .json({ message: "Champs obligatoires manquants !" });
    }

    const hashedPwd = await bcrypt.hash(password, 10);

    await db.run(
      `INSERT INTO Utilisateur (nom, postnom, sexe, datenaiss, adresse, role, mail, password, photo, faculte_id, service_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nom,
        postnom,
        sexe,
        datenaiss,
        adresse,
        role,
        mail,
        hashedPwd,
        photo,
        faculte_id,
        service_id,
      ]
    );

    res.json({ message: "Utilisateur inscrit avec succès ✅" });
  } catch (err) {
    console.error("Erreur inscription :", err);
    res.status(500).json({ message: "Erreur lors de l'inscription." });
  }
});

// ➕ Récupérer 1 utilisateur avec sa faculté et son service
app.get("/api/utilisateur/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.get(
      `SELECT u.*, f.designation AS des_faculte, s.designation AS des_service
       FROM Utilisateur u
       LEFT JOIN Faculte f ON u.faculte_id = f.id
       LEFT JOIN Service s ON u.service_id = s.id
       WHERE u.id = ?`,
      [id]
    );
    if (!user)
      return res.status(404).json({ message: "Utilisateur non trouvé !" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération de l'utilisateur." });
  }
});

// 🔑 Connexion
app.post("/api/login", async (req, res) => {
  const { mail, password } = req.body;
  if (!mail || !password)
    return res.status(400).json({ message: "Email et mot de passe requis !" });

  try {
    const user = await db.get("SELECT * FROM Utilisateur WHERE mail = ?", [
      mail,
    ]);
    if (!user)
      return res.status(404).json({ message: "Utilisateur non trouvé !" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Mot de passe incorrect !" });

    // Création de la session
    req.session.user = {
      id: user.id,
      nom: user.nom,
      postnom: user.postnom,
      mail: user.mail,
      role: user.role,
      photo: user.photo,
    };

    res.json({ message: "Connexion réussie ✅", user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur lors de la connexion." });
  }
});

app.get("/api/session", (req, res) => {
  if (req.session.user) {
    res.json({ connected: true, user: req.session.user });
  } else {
    res.json({ connected: false });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res
        .status(500)
        .json({ message: "Erreur lors de la déconnexion." });
    }
    res.json({ message: "Déconnexion réussie ✅" });
  });
});

// ===========================================================
// 🧩 CRUD GÉNÉRIQUE POUR CHAQUE TABLE
// ===========================================================

// 🔄 FACULTE
app.get("/api/faculte", async (req, res) =>
  res.json(await db.all("SELECT * FROM Faculte"))
);
app.get("/api/faculte/:id", async (req, res) =>
  res.json(await db.get("SELECT * FROM Faculte WHERE id = ?", [req.params.id]))
);
app.post("/api/faculte", async (req, res) => {
  const { designation } = req.body;
  await db.run("INSERT INTO Faculte (designation) VALUES (?)", [designation]);
  res.json({ message: "Faculté ajoutée ✅" });
});
app.put("/api/faculte/:id", async (req, res) => {
  const { designation } = req.body;
  await db.run("UPDATE Faculte SET designation = ? WHERE id = ?", [
    designation,
    req.params.id,
  ]);
  res.json({ message: "Faculté modifiée ✅" });
});
app.delete("/api/faculte/:id", async (req, res) => {
  await db.run("DELETE FROM Faculte WHERE id = ?", [req.params.id]);
  res.json({ message: "Faculté supprimée ❌" });
});

// 🔄 SERVICE
app.get("/api/service", async (req, res) =>
  res.json(await db.all("SELECT * FROM Service"))
);
app.get("/api/service/:id", async (req, res) =>
  res.json(await db.get("SELECT * FROM Service WHERE id = ?", [req.params.id]))
);
app.post("/api/service", async (req, res) => {
  const { designation } = req.body;
  await db.run("INSERT INTO Service (designation) VALUES (?)", [designation]);
  res.json({ message: "Service ajouté ✅" });
});
app.put("/api/service/:id", async (req, res) => {
  const { designation } = req.body;
  await db.run("UPDATE Service SET designation = ? WHERE id = ?", [
    designation,
    req.params.id,
  ]);
  res.json({ message: "Service modifié ✅" });
});
app.delete("/api/service/:id", async (req, res) => {
  await db.run("DELETE FROM Service WHERE id = ?", [req.params.id]);
  res.json({ message: "Service supprimé ❌" });
});

// 🔄 CATEGORIE
app.get("/api/categorie", async (req, res) =>
  res.json(await db.all("SELECT * FROM Categorie"))
);
app.get("/api/categorie/:id", async (req, res) =>
  res.json(
    await db.get("SELECT * FROM Categorie WHERE id = ?", [req.params.id])
  )
);
app.post("/api/categorie", async (req, res) => {
  const { designation, nom } = req.body;
  await db.run("INSERT INTO Categorie (designation, nom) VALUES (?, ?)", [
    designation,
    nom,
  ]);
  res.json({ message: "Catégorie ajoutée ✅" });
});
app.put("/api/categorie/:id", async (req, res) => {
  const { designation, nom } = req.body;
  await db.run("UPDATE Categorie SET designation = ?, nom = ? WHERE id = ?", [
    designation,
    nom,
    req.params.id,
  ]);
  res.json({ message: "Catégorie modifiée ✅" });
});
app.delete("/api/categorie/:id", async (req, res) => {
  await db.run("DELETE FROM Categorie WHERE id = ?", [req.params.id]);
  res.json({ message: "Catégorie supprimée ❌" });
});

// 🔄 DOCUMENT
app.get("/api/document", async (req, res) =>
  res.json(
    await db.all(
      "SELECT d.*, c.designation AS categorie_designation FROM Document d INNER JOIN Utilisateur u ON d.utilisateur_id=u.id INNER JOIN Categorie c ON d.categorie_id=c.id"
    )
  )
);
app.get("/api/document/:id", async (req, res) =>
  res.json(await db.get("SELECT * FROM Document WHERE id = ?", [req.params.id]))
);
// Exemple pour gérer upload de fichier document
// 🔄 DOCUMENT - Ajout avec session
app.post("/api/document", upload.single("file"), async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ message: "Utilisateur non connecté" });
    }

    const fileUrl = req.file ? "/uploads/" + req.file.filename : null;
    console.log("Fichié envoyé est : " + fileUrl);

    const { description, code, categorie_id, niveau_conf } = req.body;

    const utilisateur_id = req.session.user.id; // ID de l'utilisateur connecté
    const date_created = new Date().toISOString(); // Date actuelle en format ISO

    await db.run(
      `INSERT INTO Document (description, code, url, date_created, niveau_conf, categorie_id, utilisateur_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        description,
        code,
        fileUrl,
        date_created,
        niveau_conf,
        categorie_id,
        utilisateur_id,
      ]
    );

    res.json({ message: "Document ajouté ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur lors de l'ajout du document." });
  }
});

app.put("/api/document/:id", async (req, res) => {
  const { description, code, url, niveau_conf } = req.body;
  await db.run(
    "UPDATE Document SET description = ?, code = ?, url = ?, niveau_conf = ? WHERE id = ?",
    [description, code, url, niveau_conf, req.params.id]
  );
  res.json({ message: "Document modifié ✅" });
});
app.delete("/api/document/:id", async (req, res) => {
  await db.run("DELETE FROM Document WHERE id = ?", [req.params.id]);
  res.json({ message: "Document supprimé ❌" });
});

// 🔄 RECHERCHER
app.get("/api/rechercher", async (req, res) =>
  res.json(
    await db.all(
      "SELECT r.*, u.*, s.designation as des_service, f.designation as des_faculte FROM Rechercher r INNER JOIN Utilisateur u ON r.utilisateur_id=u.id LEFT JOIN Service s ON u.service_id=s.id LEFT JOIN Faculte f ON u.faculte_id=f.id"
    )
  )
);
app.get("/api/rechercher/:id", async (req, res) =>
  res.json(
    await db.get("SELECT * FROM Rechercher WHERE id = ?", [req.params.id])
  )
);
app.post("/api/rechercher", async (req, res) => {
  const { resultat, date, utilisateur_id, document_id } = req.body;
  await db.run(
    "INSERT INTO Rechercher (resultat, date, utilisateur_id, document_id) VALUES (?, ?, ?, ?)",
    [resultat, date, utilisateur_id, document_id]
  );
  res.json({ message: "Recherche enregistrée ✅" });
});
app.delete("/api/rechercher/:id", async (req, res) => {
  await db.run("DELETE FROM Rechercher WHERE id = ?", [req.params.id]);
  res.json({ message: "Recherche supprimée ❌" });
});

//-------------------------------------------------------------------------------------------------------------------------
// scanner_ucb/server.js
import cors from "cors";
import { log } from "console";

app.use(cors());
// app.use(express.json({ limit: "3000mb" }));
// app.use(express.urlencoded({ limit: "3000mb", extended: true }));

const folder = path.resolve("public/uploads");
if (!fs.existsSync(folder)) fs.mkdirSync(folder);

app.post("/upload-pdf", (req, res) => {
  const { pdfBase64, filename } = req.body;
  const buffer = Buffer.from(pdfBase64, "base64");
  const savePath = path.join(folder, filename);
  fs.writeFileSync(savePath, buffer);
  console.log("✅ PDF sauvegardé :", savePath);
  res.json({ success: true, file: filename });
});

app.use(express.static(".")); // sert index.html

// 🗑️ Supprimer un PDF spécifique
app.post("/delete-pdf", (req, res) => {
  const { filename } = req.body;
  const filePath = path.join(folder, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("🗑️ Supprimé :", filename);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Fichier non trouvé" });
  }
});

// Sert les fichiers PDF pour téléchargement
app.use("/docs", express.static(folder));
//------------------------------------------------------------------------------------

// ===============================
// 🚀 Lancer le serveur
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`)
);
