// === INSCRIPTION ===
const regForm = document.getElementById("registerForm");
if (regForm) {
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      username: document.getElementById("username").value,
      email: document.getElementById("email").value,
      password: document.getElementById("password").value,
    };
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    alert(result.message);
    if (res.ok) window.location = "index.html";
  });
}

// === CONNEXION ===
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      email: document.getElementById("loginEmail").value,
      password: document.getElementById("loginPassword").value,
    };
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    // alert(result.message);
    if (res.ok) {
      localStorage.setItem("userId", result.userId);
      localStorage.setItem("username", result.username);
      window.location = "users.html";
    }
  });
}

// === LISTE UTILISATEURS ===
const userListTbody = document.getElementById("userList");
if (userListTbody) {
  fetch("/api/users")
    .then((res) => res.json())
    .then((users) => {
      const html = users
        .map(
          (u) => `
        <tr>
          <td>${u.username}</td>
          <td>${u.email}</td>
          <td>${u.product_name ?? "-"}</td>
          <td>${u.description ?? "-"}</td>
        </tr>
      `
        )
        .join("");
      userListTbody.innerHTML = html;
    });
}

// === AJOUT PRODUIT ===
const productForm = document.getElementById("productForm");
if (productForm) {
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      userId: localStorage.getItem("userId"),
      name: document.getElementById("productName").value,
      description: document.getElementById("productDesc").value,
    };
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    // alert(result.message);
    if (res.ok) location.reload();
  });
}

// Affichage de l'utilisateur connecté
const currentUserSpan = document.getElementById("currentUser");

fetch("/api/currentUser")
  .then((res) => res.json())
  .then((data) => {
    if (data.username) {
      currentUserSpan.textContent = data.username;
    } else {
      // Si pas connecté, redirection vers page de connexion
      window.location.href = "/login";
    }
  });

// Déconnexion
const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", () => {
  fetch("/api/logout", { method: "POST" }).then(
    () => (window.location.href = "/")
  );
});
