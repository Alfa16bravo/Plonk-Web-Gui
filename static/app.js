document.addEventListener("DOMContentLoaded", () => {
  const app = new PLONKApp();
});

class PLONKApp {
  constructor() {
    this.selectedImage = null;
    this.map = null;
    this.markersGroup = null;
    this.currentPage = 1;
    this.resultsPerPage = 5;
    this.locationCache = new Map(); // Cache pour les données de localisation
    this.iterationTimer = null;
    this.currentAnalysisController = null;
    this.currentGeocodingControllers = new Map();
    this.currentAnalysisId = null; // ID unique pour chaque analyse
    this.config = {
      api: {
        get_location_details: "/get_location_details",
      },
      map: {
        defaultCenter: [48.8566, 2.3522],
        defaultZoom: 2,
        focusZoom: 15,
        tileLayer: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    };
    this.initialize();
  }

  initialize() {
    this.setupEventListeners();
    this.initializeMap();
  }

  setupEventListeners() {
    const analyzeBtn = document.getElementById("analyzeBtn");
    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", () => this.analyzeImage());
    }

    const imageInput = document.getElementById("imageInput");
    const imageUploadArea = document.getElementById("imageUploadArea");

    if (imageUploadArea) {
      imageUploadArea.addEventListener("click", () => imageInput.click());
      imageUploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.currentTarget.classList.add("dragover");
      });
      imageUploadArea.addEventListener("dragleave", (e) => {
        e.currentTarget.classList.remove("dragover");
      });
      imageUploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
          this.handleImageFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (imageInput) {
      imageInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          this.handleImageFile(e.target.files[0]);
        }
      });
    }

    const removeImageBtn = document.getElementById("removeImage");
    if (removeImageBtn) {
      removeImageBtn.addEventListener("click", () => this.removeImage());
    }

    // Model selection
    const modelCards = document.querySelectorAll(".model-card");
    modelCards.forEach((card) => {
      card.addEventListener("click", () => {
        modelCards.forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        card.querySelector('input[type="radio"]').checked = true;
      });
    });

    // Sliders
    this.setupSlider("maxResults", "maxResultsValue");
    this.setupSlider("iterations", "iterationsValue");
    this.setupSlider("finalResults", "finalResultsValue");

    // Precision mode
    const precisionMode = document.getElementById("precisionMode");
    const precisionOptions = document.getElementById("precisionOptions");
    if (precisionMode && precisionOptions) {
      precisionMode.addEventListener("change", (e) => {
        precisionOptions.style.display = e.target.checked ? "block" : "none";
      });
    }

    // Test mode
    const testMode = document.getElementById("testMode");
    const testOptions = document.getElementById("testOptions");
    if (testMode && testOptions) {
      testMode.addEventListener("change", (e) => {
        testOptions.style.display = e.target.checked ? "block" : "none";
      });
    }
  }

  setupSlider(sliderId, displayId) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    if (slider && display) {
      slider.addEventListener("input", () => {
        display.textContent = slider.value;
      });
    }
  }

  handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedImage = e.target.result;
      this.showImagePreview(this.selectedImage);
      document.getElementById("analyzeBtn").disabled = false;
    };
    reader.readAsDataURL(file);
  }

  showImagePreview(imageSrc) {
    const preview = document.getElementById("imagePreview");
    const prompt = document.getElementById("uploadPrompt");
    const img = document.getElementById("previewImage");

    if (preview && prompt && img) {
      prompt.style.display = "none";
      img.src = imageSrc;
      preview.style.display = "block";
    }
  }

  removeImage() {
    this.selectedImage = null;
    const preview = document.getElementById("imagePreview");
    const prompt = document.getElementById("uploadPrompt");
    const imageInput = document.getElementById("imageInput");
    const analyzeBtn = document.getElementById("analyzeBtn");

    if (preview && prompt && imageInput && analyzeBtn) {
      preview.style.display = "none";
      prompt.style.display = "block";
      imageInput.value = "";
      analyzeBtn.disabled = true;
    }
  }

  showLoading(text, isIterative = false, totalIterations = 1) {
    const loadingText = document.getElementById("loadingText");
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingText && loadingOverlay) {
      loadingText.textContent = text || "Analyse en cours...";
      loadingOverlay.style.display = "flex";

      // Le compteur d'itérations sera démarré manuellement avec l'analysis_id
      // après réception de la réponse du serveur
    }
  }

  hideLoading() {
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
      loadingOverlay.style.display = "none";
    }
    // Arrêter le compteur d'itérations s'il est actif
    if (this.iterationTimer) {
      clearInterval(this.iterationTimer);
      this.iterationTimer = null;
    }
  }

  startIterationCounter(totalIterations, analysisId = null) {
    const loadingText = document.getElementById("loadingText");

    if (!analysisId) {
      // Fallback vers l'ancien système si pas d'ID d'analyse
      if (loadingText) {
        loadingText.textContent = `Mode Itératif - Itération 1/${totalIterations}...`;
      }
      return;
    }

    // Système de suivi en temps réel
    const checkProgress = async () => {
      try {
        const response = await fetch(`/get_progress/${analysisId}`);
        const progress = await response.json();
        
        if (loadingText && progress.status === 'running') {
          loadingText.textContent = `Mode Itératif - Itération ${progress.current}/${progress.total}...`;
        } else if (loadingText && progress.status === 'completed') {
          loadingText.textContent = "Finalisation des résultats...";
          if (this.iterationTimer) {
            clearInterval(this.iterationTimer);
            this.iterationTimer = null;
          }
          return;
        }
      } catch (error) {
        console.error('Erreur lors de la récupération du progrès:', error);
      }
    };

    // Vérifier le progrès toutes les secondes
    this.iterationTimer = setInterval(checkProgress, 1000);
    
    // Première vérification immédiate
     checkProgress();
   }

  async waitForResults(analysisId) {
    return new Promise((resolve, reject) => {
      const checkResults = async () => {
        try {
          const response = await fetch(`/get_results/${analysisId}`);
          
          if (response.status === 202) {
            // Analyse en cours, continuer à attendre
            setTimeout(checkResults, 1000);
            return;
          }
          
          const results = await response.json();
          
          if (response.ok) {
            resolve(results);
          } else {
            reject(new Error(results.error || 'Erreur inconnue'));
          }
        } catch (error) {
          reject(error);
        }
      };
      
      // Commencer à vérifier les résultats
      checkResults();
    });
  }

  displayTestResults(testResults, testSummary, trueCoordinates) {
    const resultsContainer = document.getElementById("resultsContainer");

    // Créer une section pour les résultats du test
    const testSection = document.createElement("div");
    testSection.className = "test-results-section mt-4";
    testSection.innerHTML = `
      <div class="card border-info">
        <div class="card-header bg-info text-white">
          <h5 class="mb-0"><i class="fas fa-chart-line"></i> Résultats du Test de Prédiction</h5>
        </div>
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-4">
              <div class="text-center">
                <h6 class="text-muted">Précision Moyenne</h6>
                <span class="h4 text-primary">${
                  testSummary.average_accuracy
                }%</span>
              </div>
            </div>
            <div class="col-md-4">
              <div class="text-center">
                <h6 class="text-muted">Meilleure Précision</h6>
                <span class="h4 text-success">${
                  testSummary.best_accuracy
                }%</span>
              </div>
            </div>
            <div class="col-md-4">
              <div class="text-center">
                <h6 class="text-muted">Distance Minimale</h6>
                <span class="h4 text-warning">${
                  testSummary.minimum_distance_km
                } km</span>
              </div>
            </div>
          </div>
          
          <div class="mb-3">
            <h6><i class="fas fa-map-marker-alt text-danger"></i> Position Réelle</h6>
            <p class="mb-0">Latitude: ${trueCoordinates.lat}, Longitude: ${
      trueCoordinates.lon
    }</p>
          </div>
          
          <h6><i class="fas fa-list"></i> Détail des Prédictions</h6>
          <div class="table-responsive">
            <table class="table table-sm table-striped">
               <thead>
                 <tr>
                   <th>N°</th>
                   <th>Prédiction</th>
                   <th>Distance (km)</th>
                   <th>Précision (%)</th>
                   <th>Évaluation</th>
                 </tr>
               </thead>
               <tbody>
                 ${testResults
                   .map((result, index) => {
                     let evaluationClass = "";
                     let evaluationText = "";
                     if (result.accuracy_percent >= 90) {
                       evaluationClass = "text-success";
                       evaluationText = "Excellent";
                     } else if (result.accuracy_percent >= 70) {
                       evaluationClass = "text-info";
                       evaluationText = "Bon";
                     } else if (result.accuracy_percent >= 30) {
                       evaluationClass = "text-warning";
                       evaluationText = "Moyen";
                     } else {
                       evaluationClass = "text-danger";
                       evaluationText = "Faible";
                     }

                     return `
                     <tr>
                       <td><strong>${index + 1}</strong></td>
                       <td>${result.predicted_lat.toFixed(
                         6
                       )}, ${result.predicted_lon.toFixed(6)}</td>
                       <td>${result.distance_km}</td>
                       <td><span class="${evaluationClass}">${
                       result.accuracy_percent
                     }%</span></td>
                       <td><span class="${evaluationClass}">${evaluationText}</span></td>
                     </tr>
                   `;
                   })
                   .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    resultsContainer.appendChild(testSection);
  }

  initializeMap() {
    const mapElement = document.getElementById("map");
    if (!mapElement) {
      console.error("Map element not found");
      return;
    }

    this.map = L.map("map").setView(
      this.config.map.defaultCenter,
      this.config.map.defaultZoom
    );

    L.tileLayer(this.config.map.tileLayer, {
      attribution: this.config.map.attribution,
      maxZoom: 19,
    }).addTo(this.map);

    this.markersGroup = L.layerGroup().addTo(this.map);

    // Forcer le redimensionnement de la carte
    setTimeout(() => {
      this.map.invalidateSize();
    }, 100);
  }

  async analyzeImage() {
    if (!this.selectedImage) {
      alert("Please select an image first.");
      return;
    }

    // Annuler l'analyse précédente si elle est en cours
    if (this.currentAnalysisController) {
      this.currentAnalysisController.abort();
    }

    // Annuler tous les géocodages en cours
    this.currentGeocodingControllers.forEach((controller) => {
      controller.abort();
    });
    this.currentGeocodingControllers.clear();

    // Créer un nouveau contrôleur pour cette analyse
    this.currentAnalysisController = new AbortController();

    // Générer un ID unique pour cette analyse
    this.currentAnalysisId =
      Date.now() + "_" + Math.random().toString(36).substr(2, 9);

    // Vérifier si le mode itératif est activé
    const isIterativeMode = document.getElementById("precisionMode").checked;
    const totalIterations = isIterativeMode
      ? parseInt(document.getElementById("iterations").value)
      : 1;

    if (isIterativeMode) {
      this.showLoading("Mode Itératif - Préparation...", true, totalIterations);
    } else {
      this.showLoading("Analyse en cours...");
    }
    const resultsContainer = document.getElementById("resultsContainer");
    resultsContainer.style.display = "block";

    try {
      // Démarrer l'analyse et obtenir l'ID
      const startResponse = await fetch('/start_analysis', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: this.currentAnalysisController.signal,
        body: JSON.stringify({
          image: this.selectedImage,
          model: document.querySelector('input[name="model"]:checked').value,
          max_results: document.getElementById("maxResults").value,
          precision_mode: document.getElementById("precisionMode").checked,
          iterations: document.getElementById("iterations").value,
          final_results: document.getElementById("finalResults").value,
          test_mode: document.getElementById("testMode").checked,
          true_lat: document.getElementById("trueLat").value,
          true_lon: document.getElementById("trueLon").value,
        }),
      });

      if (!startResponse.ok) {
        throw new Error(`HTTP error! status: ${startResponse.status}`);
      }

      const startData = await startResponse.json();

      if (startData.success && startData.analysis_id) {
        // Démarrer le suivi en temps réel immédiatement
        if (isIterativeMode) {
          this.startIterationCounter(totalIterations, startData.analysis_id);
        }
        
        // Attendre les résultats
        const results = await this.waitForResults(startData.analysis_id);
        
        if (results.success) {
          this.displayResults(results.results);

          // Afficher les résultats du test de précision si disponibles
          if (results.test_mode && results.test_results) {
            this.displayTestResults(
              results.test_results,
              results.test_summary,
              results.true_coordinates
            );
          }
        } else {
          alert(`Error: ${results.error}`);
        }
      } else {
        alert(`Error: ${startData.error}`);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return; // Ne pas afficher d'erreur pour les annulations
      }
      alert(`Une erreur s'est produite lors de l'analyse: ${error.message}`);
    } finally {
      this.hideLoading();
      this.currentAnalysisController = null;
    }
  }

  displayResults(results) {
    if (this.map) {
      this.map.invalidateSize();
    }

    // Supprimer les sections de test précédentes
    const existingTestSections = document.querySelectorAll(
      ".test-results-section"
    );
    existingTestSections.forEach((section) => section.remove());

    this.markersGroup.clearLayers();
    const resultsList = document.getElementById("resultsList");
    resultsList.innerHTML = "";

    // Associer l'ID d'analyse actuel aux résultats
    this.allResults = results.map((result) => ({
      ...result,
      analysisId: this.currentAnalysisId,
    }));
    this.currentPage = 1;

    if (results.length === 0) {
      resultsList.innerHTML = "<p>No results found.</p>";
      document.getElementById("paginationControls").style.display = "none";
      return;
    }

    // Afficher tous les marqueurs sur la carte
    this.renderAllMarkersOnMap();
    // Afficher seulement la page courante dans la liste
    this.renderCurrentPage();
    this.setupPagination();
  }

  renderAllMarkersOnMap() {
    this.markersGroup.clearLayers();
    const bounds = [];

    this.allResults.forEach((result, index) => {
      const { id, latitude, longitude, location_info } = result;
      const latLng = [latitude, longitude];
      bounds.push(latLng);

      // Créer une icône personnalisée pour le premier résultat (rouge) et les autres (bleu)
      const isFirstResult = index === 0;
      const markerColor = isFirstResult ? "red" : "blue";

      const customIcon = L.divIcon({
        className: "custom-marker",
        html: `<div style="background-color: ${markerColor}; width: 25px; height: 25px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><i class="fas fa-map-marker-alt" style="color: white; font-size: 12px;"></i></div>`,
        iconSize: [25, 25],
        iconAnchor: [12, 12],
      });

      const marker = L.marker(latLng, { icon: customIcon }).addTo(
        this.markersGroup
      );

      // Utiliser la même logique de numérotation globale que dans renderCurrentPage
      const globalIndex = index + 1;
      const resultLabel = isFirstResult
        ? "Résultat le plus probable"
        : `Résultat ${globalIndex}`;
      const popupContent = `
        <div class="popup-content">
          <b>${resultLabel}</b><br>
          <span id="location-details-map-${id}">${location_info.full_address}</span><br>
          <button class="btn-street-view-popup" onclick="window.open('https://www.google.com/maps/@${latitude},${longitude},3a,75y,90t/data=!3m6!1e1!3m4!1s0x0:0x0!2e0!7i13312!8i6656', '_blank');" title="Ouvrir dans Street View">
            <i class="fas fa-street-view"></i> Street View
          </button>
        </div>`;
      marker.bindPopup(popupContent);

      // Charger les détails de localisation en arrière-plan avec cache
      const currentResult = this.allResults.find((r) => r.id === id);
      const analysisId = currentResult
        ? currentResult.analysisId
        : this.currentAnalysisId;
      // Utiliser l'index global au lieu de l'index local pour éviter les conflits
      this.fetchLocationDetailsWithCache(
        latitude,
        longitude,
        id,
        globalIndex - 1,
        true,
        analysisId
      );
    });

    if (bounds.length > 0) {
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  renderCurrentPage() {
    const resultsList = document.getElementById("resultsList");
    resultsList.innerHTML = "";

    const startIndex = (this.currentPage - 1) * this.resultsPerPage;
    const endIndex = startIndex + this.resultsPerPage;
    const pageResults = this.allResults.slice(startIndex, endIndex);

    pageResults.forEach((result, index) => {
      const { id, latitude, longitude, location_info } = result;
      const latLng = [latitude, longitude];

      // Créer une icône personnalisée pour le premier résultat (rouge) et les autres (bleu)
      const isFirstResult = startIndex + index === 0;
      const resultLabel = isFirstResult
        ? "Résultat le plus probable"
        : `Result ${startIndex + index + 1}`;

      const resultItem = document.createElement("div");
      resultItem.className = isFirstResult
        ? "result-card first-result"
        : "result-card";

      const resultTitle = isFirstResult
        ? `<h6><i class="fas fa-map-marker-alt" style="color: red;"></i> Résultat le plus probable <span class="badge badge-danger">TOP</span></h6>`
        : `<h6><i class="fas fa-map-marker-alt" style="color: blue;"></i> Résultat ${
            startIndex + index + 1
          }</h6>`;

      resultItem.innerHTML = `
                <div class="result-header">
                    ${resultTitle}
                </div>
                <div id="location-details-list-${id}" class="location-details">
                    <div class="loading-location">
                        <i class="fas fa-spinner fa-spin"></i> Recherche de la localisation...
                    </div>
                </div>
                <div class="coordinates-info">
                    <div class="coordinates-container">
                        <div class="coordinates-label">
                            <strong>📍 Coordonnées GPS:</strong>
                        </div>
                        <div class="coordinates-value">
                            <span class="coordinates-text">${latitude.toFixed(
                              6
                            )}, ${longitude.toFixed(6)}</span>
                            <button class="btn-copy-coords" onclick="navigator.clipboard.writeText('${latitude}, ${longitude}'); this.innerHTML='<i class=&quot;fas fa-check&quot;></i> Copié!'; setTimeout(() => this.innerHTML='<i class=&quot;fas fa-copy&quot;></i>', 2000);" title="Copier les coordonnées">
                                 <i class="fas fa-copy"></i>
                             </button>
                             <button class="btn-street-view" onclick="window.open('https://www.google.com/maps/@${latitude},${longitude},3a,75y,90t/data=!3m6!1e1!3m4!1s0x0:0x0!2e0!7i13312!8i6656', '_blank');" title="Ouvrir dans Street View">
                                 <i class="fas fa-street-view"></i>
                             </button>
                        </div>
                    </div>
                </div>
            `;
      resultItem.addEventListener("click", () => {
        this.map.setView(latLng, this.config.map.focusZoom);
        // Trouver le marqueur correspondant et ouvrir son popup
        this.markersGroup.eachLayer((marker) => {
          const markerLatLng = marker.getLatLng();
          if (
            Math.abs(markerLatLng.lat - latitude) < 0.000001 &&
            Math.abs(markerLatLng.lng - longitude) < 0.000001
          ) {
            marker.openPopup();
          }
        });
      });
      resultsList.appendChild(resultItem);

      // Passer l'index du résultat pour la priorisation
      const currentResult = this.allResults.find((r) => r.id === id);
      const analysisId = currentResult
        ? currentResult.analysisId
        : this.currentAnalysisId;
      this.fetchLocationDetailsWithCache(
        latitude,
        longitude,
        id,
        startIndex + index,
        false,
        analysisId
      );
    });
  }

  async fetchLocationDetailsWithCache(
    lat,
    lon,
    resultId,
    resultIndex = 0,
    isForMap = false,
    analysisId = null
  ) {
    // Utiliser l'ID d'analyse actuel si non fourni
    const currentAnalysisId = analysisId || this.currentAnalysisId;
    // Inclure l'ID du résultat dans la clé de cache pour éviter les conflits
    const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}_${resultId}`;

    // Vérifier si les données sont déjà en cache
    if (this.locationCache.has(cacheKey)) {
      const cachedData = this.locationCache.get(cacheKey);
      this.updateLocationDisplay(cachedData, resultId, isForMap);
      return;
    }

    // Créer un contrôleur d'annulation pour cette requête de géocodage
    const controller = new AbortController();
    const requestKey = `${resultId}_${resultIndex}`;
    this.currentGeocodingControllers.set(requestKey, controller);

    // Si pas en cache, charger les données
    try {
      const response = await fetch(this.config.api.get_location_details, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ lat, lon, result_index: resultIndex }),
      });
      const data = await response.json();

      if (data.success) {
        // Vérifier que cette requête correspond toujours à l'analyse actuelle
        if (currentAnalysisId !== this.currentAnalysisId) {
          return;
        }

        // Mettre en cache les données
        this.locationCache.set(cacheKey, data.location_info);
        this.updateLocationDisplay(data.location_info, resultId, isForMap);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return; // Ne pas afficher d'erreur pour les annulations
      }
    } finally {
      // Nettoyer le contrôleur
      this.currentGeocodingControllers.delete(requestKey);
    }
  }

  updateLocationDisplay(locationInfo, resultId, isForMap) {
    const { city, country, road, full_address } = locationInfo;

    // Créer un affichage structuré avec labels
    let displayHTML = '<div class="location-info">';

    if (road) {
      displayHTML += `
        <div class="location-item">
          <strong>📍 Rue:</strong> 
          <span class="copyable" onclick="navigator.clipboard.writeText('${road.replace(
            /'/g,
            "\\'"
          )}')">${road}</span>
        </div>`;
    }

    if (city) {
      displayHTML += `
        <div class="location-item">
          <strong>🏙️ Ville:</strong> 
          <span class="copyable" onclick="navigator.clipboard.writeText('${city.replace(
            /'/g,
            "\\'"
          )}')">${city}</span>
        </div>`;
    }

    if (country) {
      displayHTML += `
        <div class="location-item">
          <strong>🌍 Pays:</strong> 
          <span class="copyable" onclick="navigator.clipboard.writeText('${country.replace(
            /'/g,
            "\\'"
          )}')">${country}</span>
        </div>`;
    }

    displayHTML += "</div>";

    if (!road && !city && !country) {
      displayHTML = `<div class="location-info">${
        full_address || "Informations non disponibles"
      }</div>`;
    }

    // Mettre à jour l'affichage dans la liste des résultats
    const listItem = document.getElementById(
      `location-details-list-${resultId}`
    );
    if (listItem) {
      listItem.innerHTML = displayHTML;
    }

    // Mettre à jour le popup de la carte si c'est pour la carte
    if (isForMap) {
      const popupHTML = displayHTML.replace(/onclick="[^"]*"/g, "");
      this.markersGroup.eachLayer((marker) => {
        const popupContent = marker.getPopup().getContent();
        if (popupContent.includes(`location-details-map-${resultId}`)) {
          const updatedContent = popupContent.replace(
            new RegExp(
              `<span id="location-details-map-${resultId}">.*?</span>`,
              "s"
            ),
            `<span id="location-details-map-${resultId}">${popupHTML}</span>`
          );
          marker.setPopupContent(updatedContent);
        }
      });
    }
  }

  setupPagination() {
    const paginationControls = document.getElementById("paginationControls");
    const pageInfo = document.getElementById("pageInfo");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const totalPages = Math.ceil(this.allResults.length / this.resultsPerPage);

    if (totalPages <= 1) {
      paginationControls.style.display = "none";
      return;
    }

    paginationControls.style.display = "flex";
    pageInfo.textContent = `Page ${this.currentPage} / ${totalPages}`;
    prevPageBtn.disabled = this.currentPage === 1;
    nextPageBtn.disabled = this.currentPage === totalPages;

    const newPrevBtn = prevPageBtn.cloneNode(true);
    prevPageBtn.parentNode.replaceChild(newPrevBtn, prevPageBtn);
    newPrevBtn.addEventListener("click", () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderCurrentPage();
        this.setupPagination();
      }
    });

    const newNextBtn = nextPageBtn.cloneNode(true);
    nextPageBtn.parentNode.replaceChild(newNextBtn, nextPageBtn);
    newNextBtn.addEventListener("click", () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderCurrentPage();
        this.setupPagination();
      }
    });
  }
}
