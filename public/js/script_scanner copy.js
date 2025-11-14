const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const pagesContainer = document.getElementById("pages");
const downloadLink = document.getElementById("download");
let capturedPages = [];

// --- Éditeur modal ---
const modal = document.getElementById("editor-modal");
const editCanvas = document.getElementById("edit-canvas");
const editCtx = editCanvas.getContext("2d");
let currentEditIndex = null;
let currentRotation = 0;

// Démarrage de la caméra
navigator.mediaDevices
  .getUserMedia({ video: { facingMode: "environment" } })
  .then((stream) => (video.srcObject = stream))
  .catch(() => alert("Impossible d'accéder à la caméra."));

// Capture d’image
document.getElementById("capture").addEventListener("click", () => {
  // Dimensions A4 en pixels (rapport 210x297)
  const a4Width = 595;
  const a4Height = 742;

  // On redessine la vidéo sur un canvas au format A4
  canvas.width = a4Width;
  canvas.height = a4Height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, a4Width, a4Height);

  const imageData = canvas.toDataURL("image/jpeg", 0.7);
  capturedPages.push(imageData);
  afficherPages();
});

// Affichage miniatures
function afficherPages() {
  pagesContainer.innerHTML = "";
  capturedPages.forEach((img, i) => {
    const div = document.createElement("div");
    div.className = "page";
    div.innerHTML = `
      <img src="${img}" alt="Page ${i + 1}">
      <button class="edit-btn" onclick="editPage(${i})">✏️</button>
      <button class="delete-btn" onclick="deletePage(${i})">✕</button>
    `;
    pagesContainer.appendChild(div);
  });
}

function deletePage(i) {
  capturedPages.splice(i, 1);
  afficherPages();
}

// --- Édition d’une image ---
window.editPage = function (index) {
  modal.style.display = "flex";
  currentEditIndex = index;
  currentRotation = 0;

  const img = new Image();
  img.onload = () => {
    editCanvas.width = img.width;
    editCanvas.height = img.height;
    editCtx.drawImage(img, 0, 0);
  };
  img.src = capturedPages[index];
};

// Rotation
document
  .getElementById("rotate-left")
  .addEventListener("click", () => rotate(-90));
document
  .getElementById("rotate-right")
  .addEventListener("click", () => rotate(90));

function rotate(angle) {
  currentRotation = (currentRotation + angle) % 360;
  const temp = document.createElement("canvas");
  const tctx = temp.getContext("2d");
  temp.width = editCanvas.width;
  temp.height = editCanvas.height;
  tctx.drawImage(editCanvas, 0, 0);

  if (angle % 180 !== 0) {
    [editCanvas.width, editCanvas.height] = [
      editCanvas.height,
      editCanvas.width,
    ];
  }

  editCtx.save();
  editCtx.translate(editCanvas.width / 2, editCanvas.height / 2);
  editCtx.rotate((angle * Math.PI) / 180);
  editCtx.drawImage(temp, -temp.width / 2, -temp.height / 2);
  editCtx.restore();
}

// Amélioration auto (contraste + luminosité simple)
document.getElementById("enhance").addEventListener("click", () => {
  const imgData = editCtx.getImageData(
    0,
    0,
    editCanvas.width,
    editCanvas.height
  );
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * 1.1 + 10); // R
    data[i + 1] = Math.min(255, data[i + 1] * 1.1 + 10); // G
    data[i + 2] = Math.min(255, data[i + 2] * 1.1 + 10); // B
  }
  editCtx.putImageData(imgData, 0, 0);
});

// Sauvegarde des modifications
document.getElementById("save-edit").addEventListener("click", () => {
  capturedPages[currentEditIndex] = editCanvas.toDataURL("image/jpeg", 0.7);
  modal.style.display = "none";
  afficherPages();
});

// Annuler
document.getElementById("cancel-edit").addEventListener("click", () => {
  modal.style.display = "none";
});

// Génération du PDF + envoi serveur
document.getElementById("generate").addEventListener("click", async () => {
  if (capturedPages.length === 0) return alert("Aucune page capturée !");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210; // mm
  const pageHeight = 297; // mm

  for (let i = 0; i < capturedPages.length; i++) {
    const imgData = capturedPages[i];
    if (i > 0) pdf.addPage();

    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Remplir toute la page A4 sans bordure
        pdf.addImage(imgData, "JPEG", 1, 1, pageWidth, pageHeight);
        resolve();
      };
      img.src = imgData;
    });
  }

  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.style.display = "inline-block";

  // Insérer le blob dans l'input #file_scan
  $("#file_scan").show();
  const fileInput = document.getElementById("file_scan");
  const fileDescription = document.getElementById("description_scan").value;
  const fileName = `Scan-${fileDescription}-${Date.now()}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });
  const dt = new DataTransfer();
  dt.items.add(file);

  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change"));

  //Enregistrement du formulaire scan
  const description = $("#description_scan").val().trim();
  const code = $("#code_scan").val().trim();
  const categorie_id = $("#categorie_scan").val();
  const niveau_conf = $("#niveau_conf_scan").val();
  const file_scan = $("#file_scan")[0].files[0];
  const formData = new FormData();
  formData.append("description", description);
  formData.append("code", code);
  formData.append("categorie_id", categorie_id);
  formData.append("niveau_conf", niveau_conf);
  if (file_scan) formData.append("file", file_scan, file_scan.name);

  const url_post = "/api/document";
  const method = "POST";
  if (!description || !code || !categorie_id || !niveau_conf || !file_scan) {
    $("#formMessage2").html(
      `<span class="text-danger">Veuillez remplir tous les champs du formulaire de scan.</span>`
    );
    return;
  }

  try {
    const res = await fetch(url_post, { method, body: formData });
    const result = await res.json();
    $("#formMessage2").html(
      `<span class="${res.ok ? "text-success" : "text-danger"}">${
        result?.message ??
        (res.ok ? "Enregistré avec succès." : "Erreur serveur.")
      }</span>`
    );
    //Vider le formulaire et l'interface de scan
    $("#description_scan").val("");
    $("#code_scan").val("");
    $("#categorie_scan").val("");
    $("#niveau_conf_scan").val("");
    capturedPages = [];
    afficherPages();
    $("#file_scan").hide();
  } catch (err) {
    console.error(err);
    $("#formMessage").html(
      `<span class="text-danger">Erreur réseau ou serveur.</span>`
    );
  }
});
