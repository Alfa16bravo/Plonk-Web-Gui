# 🗺️ PLONK Web Interface

**Interface web moderne pour [PLONK](https://github.com/nicolas-dufour/plonk)** - (✨Nicolas dufour✨) Géolocalisation d'images par IA avec cartographie interactive

## ✨ Fonctionnalités Principales

### 🤖 **Intelligence Artificielle PLONK**
- **3 modèles spécialisés** disponibles :
  - `nicolas-dufour/PLONK_YFCC` - Géolocalisation générale
  - `nicolas-dufour/PLONK_iNaturalist` - Nature et Biodiversité  
  - `nicolas-dufour/PLONK_OSV_5M` - Open Street View

### 🗺️ **Cartographie Interactive Avancée**
- **Affichage des coordonnées GPS** précises (latitude/longitude)
- **Géocodage intelligent** via Photon et Nominatim :
  - 📍 **Adresse complète** (rue, numéro, code postal)
  - 🏙️ **Ville et région** 
  - 🌍 **Pays et continent**
  - 📊 **Données administratives** détaillées
  - 📸 **Accès à Street View directement depuis l'interface**

### 🔍 **Modes d'Analyse Sophistiqués**
- **Mode Itératif** : Analyse en plusieurs passes pour une précision maximale
- **Mode Test de Prédiction** : Comparaison avec coordonnées réelles + calcul de précision
- **Calcul de distance** automatique entre prédiction et réalité



## 🖼️ Aperçu de l'Interface

<img width="1991" height="823" alt="Image" src="https://github.com/user-attachments/assets/6f3d6016-8a7e-4200-aa73-1bb5bf88d3f4" />


<img width="1988" height="1193" alt="Image" src="https://github.com/user-attachments/assets/d950864a-6d97-4af4-b535-aa5a06dc16d5" />

---

## 🚀 Installation Rapide

### Prérequis
- **Python 3.10+**
- **Git**
- **Conda**
- **Cuda** (GPU Nvidia)

### Instructions
```bash
# Clonage du repository
git clone https://github.com/Alfa16bravo/plonk-web-gui.git
cd plonk-web-gui

# Création de l'environnement conda
conda create -n plonk python=3.10
conda activate plonk

# Installation des dépendances
pip install -r requirements.txt

# Lancement de l'application
run_web_app.bat
```

**🌐 Accès :** Ouvrez votre navigateur sur **http://127.0.0.1:5000**

---

## 📊 Cas d'Usage

- 🕵️ **Investigation** : Analyse d'images pour enquêtes
- 📸 **Photography** : Retrouver lieux de prise de vue
- 🌿 **Recherche** : Géolocalisation spécimens naturels
- 🗺️ **Cartographie** : Enrichissement bases géographiques
- 🎓 **Éducation** : Apprentissage géographie interactive

---

## 🤝 Contribution & Support

Ce projet est basé sur [PLONK](https://github.com/nicolas-dufour/plonk) et respecte sa licence.

---

<div align="center">

**Développé avec ❤️ par Adalm**

[⭐ Star ce projet](https://github.com/Alfa16bravo/plonk-web-gui) • [🐛 Reporter un bug](https://github.com/Alfa16bravo/plonk-web-gui/issues) • [💡 Proposer une feature](https://github.com/Alfa16bravo/plonk-web-gui/issues)

</div>
