$(document).ready(function () {
  const $video = $("#video");
  const $canvas = $("#canvas");
  const $pagesContainer = $("#pages");
  const $downloadLink = $("#download");
  let capturedPages = [];

  // --- Éditeur modal ---
  const $modal = $("#editor-modal");
  const $editCanvas = $("#edit-canvas")[0];
  const editCtx = $editCanvas.getContext("2d");
  let currentEditIndex = null;
  let currentRotation = 0;

  // Démarrage de la caméra
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" } })
    .then((stream) => ($video[0].srcObject = stream))
    .catch(() => alert("Impossible d'accéder à la caméra."));

  // Capture d’image
  $("#capture").on("click", () => {
    const a4Width = 595;
    const a4Height = 742;

    $canvas[0].width = a4Width;
    $canvas[0].height = a4Height;
    const ctx = $canvas[0].getContext("2d");
    ctx.drawImage($video[0], 0, 0, a4Width, a4Height);

    const imageData = $canvas[0].toDataURL("image/jpeg", 0.7);
    capturedPages.push(imageData);
    afficherPages();
  });

  // Affichage miniatures
  function afficherPages() {
    $pagesContainer.empty();
    capturedPages.forEach((img, i) => {
      const $div = $(`
        <div class="page">
          <img src="${img}" alt="Page ${i + 1}">
          <button class="edit-btn" data-index="${i}">✏️</button>
          <button class="delete-btn" data-index="${i}">✕</button>
        </div>
      `);
      $pagesContainer.append($div);
    });
  }

  // Supprimer une page
  $pagesContainer.on("click", ".delete-btn", function () {
    const i = $(this).data("index");
    capturedPages.splice(i, 1);
    afficherPages();
  });

  // --- Édition d’une image ---
  window.editPage = function (index) {
    $modal.css("display", "flex");
    currentEditIndex = index;
    currentRotation = 0;

    const img = new Image();
    img.onload = () => {
      $editCanvas.width = img.width;
      $editCanvas.height = img.height;
      editCtx.drawImage(img, 0, 0);
    };
    img.src = capturedPages[index];
  };

  $pagesContainer.on("click", ".edit-btn", function () {
    editPage($(this).data("index"));
  });

  // Rotation
  $("#rotate-left").on("click", () => rotate(-90));
  $("#rotate-right").on("click", () => rotate(90));

  function rotate(angle) {
    currentRotation = (currentRotation + angle) % 360;
    const temp = document.createElement("canvas");
    const tctx = temp.getContext("2d");
    temp.width = $editCanvas.width;
    temp.height = $editCanvas.height;
    tctx.drawImage($editCanvas, 0, 0);

    if (angle % 180 !== 0) {
      [$editCanvas.width, $editCanvas.height] = [
        $editCanvas.height,
        $editCanvas.width,
      ];
    }

    editCtx.save();
    editCtx.translate($editCanvas.width / 2, $editCanvas.height / 2);
    editCtx.rotate((angle * Math.PI) / 180);
    editCtx.drawImage(temp, -temp.width / 2, -temp.height / 2);
    editCtx.restore();
  }

  // Amélioration auto
  $("#enhance").on("click", () => {
    const imgData = editCtx.getImageData(
      0,
      0,
      $editCanvas.width,
      $editCanvas.height
    );
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * 1.1 + 10);
      data[i + 1] = Math.min(255, data[i + 1] * 1.1 + 10);
      data[i + 2] = Math.min(255, data[i + 2] * 1.1 + 10);
    }
    editCtx.putImageData(imgData, 0, 0);
  });

  // Sauvegarde
  $("#save-edit").on("click", () => {
    capturedPages[currentEditIndex] = $editCanvas.toDataURL("image/jpeg", 0.7);
    $modal.hide();
    afficherPages();
  });

  // Annuler
  $("#cancel-edit").on("click", () => {
    $modal.hide();
  });

  // Génération du PDF + envoi serveur
  $("#generate").on("click", async () => {
    if (capturedPages.length === 0) return alert("Aucune page capturée !");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210;
    const pageHeight = 297;

    for (let i = 0; i < capturedPages.length; i++) {
      const imgData = capturedPages[i];
      if (i > 0) pdf.addPage();

      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          pdf.addImage(imgData, "JPEG", 1, 1, pageWidth, pageHeight);
          resolve();
        };
        img.src = imgData;
      });
    }

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    $downloadLink.attr("href", url).show();

    // Insérer le blob dans l'input #file_scan
    $("#file_scan").show();
    const fileInput = $("#file_scan")[0];
    const fileDescription = $("#description_scan").val();
    const fileName = `Scan-${fileDescription}-${Date.now()}.pdf`;
    const file = new File([blob], fileName, { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(file);

    fileInput.files = dt.files;
    $(fileInput).trigger("change");

    // Enregistrement du formulaire scan
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

    if (!description || !code || !categorie_id || !niveau_conf || !file_scan) {
      $("#formMessage2").html(
        `<span class="text-danger">Veuillez remplir tous les champs du formulaire de scan.</span>`
      );
      return;
    }

    try {
      const res = await fetch("/api/document", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      $("#formMessage2").html(
        `<span class="${res.ok ? "text-success" : "text-danger"}">${
          result?.message ??
          (res.ok ? "Enregistré avec succès." : "Erreur serveur.")
        }</span>`
      );
      // Reset
      $(
        "#description_scan, #code_scan, #categorie_scan, #niveau_conf_scan"
      ).val("");
      capturedPages = [];
      afficherPages();
      $("#file_scan").hide();
    } catch (err) {
      console.error(err);
      $("#formMessage2").html(
        `<span class="text-danger">Erreur réseau ou serveur.</span>`
      );
    }
  });
});
//------------------------------------------------------------------------------------------------------------------------------------------------
// Enregistrement document scanné via la caméra
//------------------------------------------------------------------------------------------------------------------------------------------------

$(document).ready(function () {
  // afficher le formulaire de scanning ou d'upload
  $('input[name="numeriser"]').change(function () {
    if ($(this).attr("id") === "scan") {
      // On affiche la div scanning_div
      $("#scanning_div").show();
      $("#uploading_div").hide();
    } else {
      $("#scanning_div").hide();

      $("#uploading_div").show();
    }
  });

  // Charger les catégories dans le select
  async function loadCategories() {
    const res = await fetch("/api/categorie");
    const categories = await res.json();
    $("#scanning_div #categorie_scan, #uploading_div #categorie").html("");
    categories.forEach((cat) => {
      $("#scanning_div #categorie_scan, #uploading_div #categorie").append(
        `<option value="${cat.id}">${cat.designation}</option>`
      );
    });
  }
  loadCategories();

  let table = $("#documentTable").DataTable({
    ajax: {
      url: "/api/document",
      dataSrc: "",
    },
    columns: [
      { data: "description" },
      { data: "code" },
      { data: "categorie_designation" }, // Le backend doit renvoyer la désignation de la catégorie
      { data: "date_created" },
      { data: "niveau_conf" },
      {
        data: null,
        render: function (data, type, row) {
          return `
        <button class="btn btn-sm btn-info showBtn">Afficher</button>
        <button class="btn btn-sm btn-danger deleteBtn">Supprimer</button>
          `;
        },
      },
    ],
  });

  // Changement de mode : upload ou scan
  $('input[name="mode"]').change(function () {
    if ($(this).val() === "scan") {
      $("#fileInputContainer label").text("Scanner le document");
    } else {
      $("#fileInputContainer label").text("Fichier");
    }
  });

  // Ajouter / Modifier
  $("#documentForm").submit(async function (e) {
    e.preventDefault();
    const id = $("#documentId").val();
    const description = $("#description").val().trim();
    const code = $("#code").val().trim();
    const categorie_id = $("#categorie").val();
    const niveau_conf = $("#niveau_conf").val();
    const mode = $('input[name="mode"]:checked').val();
    const file = $("#file")[0].files[0];

    if (!description || !code || !categorie_id || !niveau_conf || !file) return;

    const formData = new FormData();
    formData.append("description", description);
    formData.append("code", code);
    formData.append("categorie_id", categorie_id);
    formData.append("niveau_conf", niveau_conf);
    formData.append("mode", mode);
    formData.append("file", file);

    const url = id ? `/api/document/${id}` : "/api/document";
    const method = id ? "PUT" : "POST";

    try {
      const res = await fetch(url, { method, body: formData });
      const result = await res.json();
      $("#formMessage").html(
        `<span class="${res.ok ? "text-success" : "text-danger"}">${
          result.message
        }</span>`
      );
      $("#documentForm")[0].reset();
      $("#documentId").val("");
      $("#saveBtn").text("Ajouter");
      $("#cancelBtn").hide();
      table.ajax.reload();
    } catch (err) {
      console.error(err);
      $("#formMessage").html('<span class="text-danger">Erreur serveur</span>');
    }
  });

  // Annuler modification
  $("#cancelBtn").click(function () {
    $("#documentForm")[0].reset();
    $("#documentId").val("");
    $("#saveBtn").text("Ajouter");
    $(this).hide();
    $("#formMessage").html("");
  });

  // Éditer
  $("#documentTable tbody").on("click", ".editBtn", function () {
    const data = table.row($(this).parents("tr")).data();
    $("#documentId").val(data.id);
    $("#description").val(data.description);
    $("#code").val(data.code);
    $("#categorie").val(data.categorie_id);
    $("#niveau_conf").val(data.niveau_conf);
    $("#saveBtn").text("Modifier");
    $("#cancelBtn").show();
  });

  // Supprimer
  $("#documentTable tbody").on("click", ".deleteBtn", async function () {
    if (!confirm("Confirmez la suppression ?")) return;
    const data = table.row($(this).parents("tr")).data();
    try {
      const res = await fetch(`/api/document/${data.id}`, {
        method: "DELETE",
      });
      const result = await res.json();
      alert(result.message);
      table.ajax.reload();
    } catch (err) {
      console.error(err);
      alert("Erreur serveur");
    }
  });

  // Afficher - ouvre le document dans un nouvel onglet (_blank) au lieu d'une iframe
  $("#documentTable tbody").on("click", ".showBtn", async function () {
    const rowData = table.row($(this).parents("tr")).data();
    try {
      // Récupère la version la plus récente depuis l'API
      const res = await fetch(`/api/document/${rowData.id}`);
      if (!res.ok) throw new Error("Erreur API");
      const doc = await res.json();
      const fileUrl = doc.url || rowData.url;
      if (!fileUrl) {
        alert("Aucun fichier associé à ce document.");
        return;
      }

      // Détermine l'URL publique. Si le champ url est déjà un chemin absolu, on l'utilise.
      const src = fileUrl.startsWith("/") ? fileUrl : `/uploads/${fileUrl}`;

      // Ouvre dans un nouvel onglet de manière sécurisée
      const a = document.createElement("a");
      a.href = src;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Impossible de charger le fichier.");
    }
  });
});
