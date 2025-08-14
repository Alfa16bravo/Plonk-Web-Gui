from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import base64
from PIL import Image
import io
import numpy as np
from plonk import PlonkPipeline
import requests
import threading
import time
import math

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Configuration globale
class PLONKConfig:
    def __init__(self):
        self.models_info = {
            "nicolas-dufour/PLONK_YFCC": {
                "name": "PLONK YFCC",
                "description": "Entraîné sur YFCC-100M (Yahoo Flickr). Idéal pour photos générales, paysages, villes, architecture. Limites : Moins performant pour Street View ou sujets spécialisés."
            },
            "nicolas-dufour/PLONK_iNaturalist": {
                "name": "PLONK iNaturalist", 
                "description": "Entraîné sur iNaturalist-21. Idéal pour photos de faune et flore. Avantage : Connaissance fine de la biodiversité. Limites : Pas optimisé pour architecture urbaine."
            },
            "nicolas-dufour/PLONK_OSV_5M": {
                "name": "PLONK Open Street View",
                "description": "Entraîné sur Open Street View 5M. Idéal pour images de rues, panneaux, bâtiments. Avantage : Excellent pour géolocalisation urbaine. Limites : Moins adapté aux paysages naturels."
            }
        }
        self.pipeline = None
        self.current_model = None
        self.geocoding_cache = {}  # Cache pour le géocodage

config = PLONKConfig()

def get_cache_key(lat, lon):
    """Génère une clé de cache pour les coordonnées (arrondie à ~100m)"""
    # Arrondir à 3 décimales (~100m de précision) pour le cache
    rounded_lat = round(lat, 3)
    rounded_lon = round(lon, 3)
    return f"{rounded_lat},{rounded_lon}"

def try_nominatim(lat, lon):
    """Essaie le géocodage avec Nominatim"""
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=16&addressdetails=1"
        headers = {
            'User-Agent': 'PLONK-Geolocation-Tool/1.0',
            'Accept': 'application/json'
        }
        response = requests.get(url, headers=headers, timeout=3)
        if response.status_code == 200:
            data = response.json()
            address = data.get('address', {})
            return {
                'full_address': data.get('display_name', ''),
                'city': address.get('city') or address.get('town') or address.get('village') or address.get('municipality', ''),
                'country': address.get('country', ''),
                'state': address.get('state', ''),
                'road': address.get('road', ''),
                'house_number': address.get('house_number', ''),
                'postcode': address.get('postcode', ''),
                'suburb': address.get('suburb', ''),
                'county': address.get('county', '')
            }
    except:
        pass
    return None

def try_photon(lat, lon):
    """Essaie le géocodage avec Photon (Komoot)"""
    try:
        url = f"https://photon.komoot.io/reverse?lat={lat}&lon={lon}"
        response = requests.get(url, timeout=3)
        if response.status_code == 200:
            data = response.json()
            if data.get('features'):
                props = data['features'][0].get('properties', {})
                return {
                    'full_address': props.get('name', ''),
                    'city': props.get('city') or props.get('town') or props.get('village', ''),
                    'country': props.get('country', ''),
                    'state': props.get('state', ''),
                    'road': props.get('street', ''),
                    'house_number': props.get('housenumber', ''),
                    'postcode': props.get('postcode', ''),
                    'suburb': props.get('suburb', ''),
                    'county': props.get('county', '')
                }
    except:
        pass
    return None

def get_location_info_detailed(lat, lon, retry_count=0):
    """Récupère les informations de localisation avec plusieurs APIs et gestion des erreurs améliorée"""
    # Vérifier le cache d'abord
    cache_key = get_cache_key(lat, lon)
    if cache_key in config.geocoding_cache:
        return config.geocoding_cache[cache_key]
    
    # Délai progressif pour éviter les limitations d'API
    if retry_count > 0:
        delay = min(retry_count * 0.5, 3.0)  # Délai progressif jusqu'à 3 secondes max
        time.sleep(delay)
    
    # Essayer plusieurs APIs dans l'ordre de préférence avec rotation
    apis = [try_photon, try_nominatim]
    
    # Rotation des APIs selon le retry_count pour éviter de surcharger une seule API
    start_index = retry_count % len(apis)
    rotated_apis = apis[start_index:] + apis[:start_index]
    
    for api_func in rotated_apis:
        try:
            result = api_func(lat, lon)
            if result and (result['city'] or result['country']):
                # Vérifier que les résultats ne sont pas vides ou "inconnu"
                city = result['city']
                country = result['country']
                
                # Filtrer les résultats de mauvaise qualité
                if city and city.lower() not in ['unknown', 'inconnu', 'ville inconnue', '']:
                    if country and country.lower() not in ['unknown', 'inconnu', 'pays inconnu', '']:
                        cleaned_result = {
                            'full_address': result['full_address'] or f"Lat: {lat:.6f}, Lon: {lon:.6f}",
                            'city': city,
                            'country': country,
                            'state': result['state'] or '',
                            'road': result['road'] or '',
                            'house_number': result['house_number'] or '',
                            'postcode': result['postcode'] or '',
                            'suburb': result['suburb'] or '',
                            'county': result['county'] or ''
                        }
                        
                        # Mettre en cache
                        config.geocoding_cache[cache_key] = cleaned_result
                        return cleaned_result
        except Exception as e:
            print(f"Erreur avec {api_func.__name__}: {e}")
            continue
    
    # Si toutes les APIs ont échoué et qu'on n'a pas encore fait de retry
    if retry_count < 2:  # Maximum 2 retries
        print(f"Retry {retry_count + 1} pour {lat}, {lon}")
        return get_location_info_detailed(lat, lon, retry_count + 1)
    
    # Valeur par défaut si toutes les APIs échouent après retries
    default_info = {
        'full_address': f"Lat: {lat:.6f}, Lon: {lon:.6f}",
        'city': 'Localisation en cours...',
        'country': 'Recherche en cours...',
        'state': '',
        'road': '',
        'house_number': '',
        'postcode': '',
        'suburb': '',
        'county': ''
    }
    
    # Ne pas mettre en cache les échecs pour permettre de réessayer plus tard
    return default_info

def load_model(model_id):
    """Charge le modèle PLONK"""
    global config
    if config.current_model != model_id:
        config.pipeline = PlonkPipeline(model_id)
        config.current_model = model_id
    return config.pipeline

def process_coordinates(coords, max_results=65):
    """Traite les coordonnées retournées par PLONK"""
    points = []
    
    if isinstance(coords, np.ndarray) and coords.shape[1] == 2:
        points = [(float(lat), float(lon)) for lat, lon in coords[:max_results]]
        
    elif isinstance(coords, (list, tuple)):
        preds = coords[0] if len(coords) > 0 else []
        if isinstance(preds, (list, tuple)):
            for p in preds[:max_results]:
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    points.append((float(p[0]), float(p[1])))
        elif isinstance(preds, dict) and 'lat' in preds and 'lon' in preds:
            points.append((float(preds['lat']), float(preds['lon'])))
            
    elif isinstance(coords, dict) and 'lat' in coords and 'lon' in coords:
        points.append((float(coords['lat']), float(coords['lon'])))
        
    return points

def calculate_distance_km(lat1, lon1, lat2, lon2):
    """Calcule la distance en kilomètres entre deux points GPS en utilisant la formule de Haversine"""
    R = 6371  # Rayon de la Terre en kilomètres
    
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_prediction_accuracy(predicted_points, true_lat, true_lon):
    """Calcule la précision des prédictions par rapport à la vraie position"""
    if not predicted_points or true_lat is None or true_lon is None:
        return None
    
    results = []
    for point in predicted_points:
        if isinstance(point, dict) and 'coordinates' in point:
            pred_lat, pred_lon = point['coordinates']
        else:
            pred_lat, pred_lon = point
        
        distance_km = calculate_distance_km(true_lat, true_lon, pred_lat, pred_lon)
        
        # Calcul du pourcentage de précision basé sur la distance
        # Plus la distance est faible, plus la précision est élevée
        # Utilisation d'une échelle logarithmique pour une meilleure répartition
        if distance_km == 0:
            accuracy_percent = 100.0
        elif distance_km < 1:  # Moins de 1 km = très précis
            accuracy_percent = max(90, 100 - (distance_km * 10))
        elif distance_km < 10:  # Moins de 10 km = précis
            accuracy_percent = max(70, 90 - ((distance_km - 1) * 2.2))
        elif distance_km < 100:  # Moins de 100 km = moyennement précis
            accuracy_percent = max(30, 70 - ((distance_km - 10) * 0.44))
        elif distance_km < 1000:  # Moins de 1000 km = peu précis
            accuracy_percent = max(5, 30 - ((distance_km - 100) * 0.028))
        else:  # Plus de 1000 km = très peu précis
            accuracy_percent = max(0, 5 - ((distance_km - 1000) * 0.001))
        
        results.append({
            'predicted_lat': pred_lat,
            'predicted_lon': pred_lon,
            'distance_km': round(distance_km, 2),
            'accuracy_percent': round(accuracy_percent, 2)
        })
    
    return results

def find_most_frequent_positions(all_points, final_count, tolerance=0.01):
    """Trouve les positions les plus fréquentes avec tolérance"""
    if not all_points:
        return []
        
    grouped_points = []
    
    for point in all_points:
        lat, lon = point
        found_group = False
        
        for group in grouped_points:
            group_lat, group_lon, count = group['center'][0], group['center'][1], group['count']
            
            if abs(lat - group_lat) <= tolerance and abs(lon - group_lon) <= tolerance:
                new_count = count + 1
                new_lat = (group_lat * count + lat) / new_count
                new_lon = (group_lon * count + lon) / new_count
                
                group['center'] = (new_lat, new_lon)
                group['count'] = new_count
                group['points'].append(point)
                found_group = True
                break
                
        if not found_group:
            grouped_points.append({
                'center': point,
                'count': 1,
                'points': [point]
            })
            
    grouped_points.sort(key=lambda x: x['count'], reverse=True)
    
    result_points = []
    for group in grouped_points[:final_count]:
        result_points.append({
            'coordinates': group['center'],
            'confidence': group['count'],
            'total_points': len(group['points'])
        })
        
    return result_points

@app.route('/')
def index():
    return render_template('index.html', models=config.models_info)

@app.route('/get_location_details', methods=['POST'])
def get_location_details():
    """Endpoint pour récupérer les détails de localisation en arrière-plan avec priorisation"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Aucune donnée reçue'}), 400
            
        lat = float(data.get('lat'))
        lon = float(data.get('lon'))
        result_index = int(data.get('result_index', 0))
        
        location_info = get_location_info_detailed(lat, lon)
        
        return jsonify({
            'success': True,
            'location_info': location_info,
            'result_index': result_index
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Variable globale pour stocker l'état des analyses
analysis_progress = {}

@app.route('/get_progress/<analysis_id>', methods=['GET'])
def get_analysis_progress(analysis_id):
    """Endpoint pour récupérer le progrès d'une analyse"""
    progress = analysis_progress.get(analysis_id, {'current': 0, 'total': 1, 'status': 'unknown'})
    return jsonify(progress)

@app.route('/start_analysis', methods=['POST'])
def start_analysis():
    """Démarre une analyse et retourne immédiatement l'ID"""
    try:
        data = request.get_json()
        
        # Générer un ID unique pour cette analyse
        analysis_id = str(int(time.time() * 1000)) + '_' + str(hash(str(data)) % 10000)
        
        # Paramètres
        precision_mode = data.get('precision_mode', False)
        iterations = int(data.get('iterations', 3)) if precision_mode else 1
        
        # Initialiser le progrès
        analysis_progress[analysis_id] = {
            'current': 0,
            'total': iterations,
            'status': 'starting',
            'data': data  # Stocker les données pour l'analyse
        }
        
        # Démarrer l'analyse en arrière-plan
        threading.Thread(target=process_analysis, args=(analysis_id,)).start()
        
        return jsonify({
            'success': True,
            'analysis_id': analysis_id
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def process_analysis(analysis_id):
    """Traite l'analyse en arrière-plan"""
    try:
        # Récupérer les données de l'analyse
        progress_data = analysis_progress[analysis_id]
        data = progress_data['data']
        
        # Paramètres
        model_id = data.get('model', 'nicolas-dufour/PLONK_YFCC')
        max_results = int(data.get('max_results', 65))
        precision_mode = data.get('precision_mode', False)
        iterations = int(data.get('iterations', 3)) if precision_mode else 1
        final_results = int(data.get('final_results', 5)) if precision_mode else max_results
        
        # Mode test de prédiction
        test_mode = data.get('test_mode', False)
        true_lat = float(data.get('true_lat', 0)) if data.get('true_lat') else None
        true_lon = float(data.get('true_lon', 0)) if data.get('true_lon') else None
        
        # Image
        image_data = data.get('image')
        if not image_data:
            analysis_progress[analysis_id]['status'] = 'error'
            analysis_progress[analysis_id]['error'] = 'Aucune image fournie'
            return
            
        # Décoder l'image base64
        image_data = image_data.split(',')[1]  # Supprimer le préfixe data:image/...
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # Charger le modèle
        pipeline = load_model(model_id)
        
        all_points = []
        
        # Analyse(s)
        for i in range(iterations):
            # Mettre à jour le progrès
            analysis_progress[analysis_id] = {
                'current': i + 1,
                'total': iterations,
                'status': 'running'
            }
            
            try:
                coords = pipeline([img], batch_size=1024)
                points = process_coordinates(coords, max_results)
                
                if precision_mode:
                    all_points.extend([(lat, lon) for lat, lon in points])
                else:
                    all_points = [(lat, lon) for lat, lon in points]
                    break
            except Exception as e:
                print(f"Erreur lors de l'itération {i+1}: {e}")
                continue
        
        # Marquer comme terminé
        analysis_progress[analysis_id]['current'] = iterations
        analysis_progress[analysis_id]['status'] = 'completed'
        
        # Traitement final
        if precision_mode and len(all_points) > 0:
            result_points = find_most_frequent_positions(all_points, final_results)
        else:
            result_points = [{
                'coordinates': (lat, lon),
                'confidence': 1,
                'total_points': 1
            } for lat, lon in all_points[:final_results]]
        
        # Calcul de la précision en mode test
        test_results = None
        if test_mode and true_lat is not None and true_lon is not None:
            test_results = calculate_prediction_accuracy(result_points, true_lat, true_lon)
        
        # Créer les résultats sans géocodage initial
        results_without_location = []
        for i, point_data in enumerate(result_points):
            lat, lon = point_data['coordinates']
            results_without_location.append({
                'id': i + 1,
                'latitude': lat,
                'longitude': lon,
                'confidence': point_data['confidence'],
                'total_points': point_data['total_points'],
                # Les détails de localisation seront chargés par le client
                'location_info': {
                    'full_address': f"Lat: {lat:.6f}, Lon: {lon:.6f}",
                    'city': 'Chargement...',
                    'country': 'Chargement...',
                }
            })

        # Stocker les résultats dans le progrès
        analysis_progress[analysis_id]['results'] = {
            'success': True,
            'results': results_without_location,
            'total_found': len(results_without_location),
            'precision_mode': precision_mode,
            'iterations': iterations if precision_mode else 1
        }
        
        # Ajouter les résultats du test si disponibles
        if test_mode:
            analysis_progress[analysis_id]['results']['test_mode'] = True
            analysis_progress[analysis_id]['results']['true_coordinates'] = {'lat': true_lat, 'lon': true_lon}
            analysis_progress[analysis_id]['results']['test_results'] = test_results
            
            # Calculer la précision moyenne
            if test_results:
                avg_accuracy = sum(r['accuracy_percent'] for r in test_results) / len(test_results)
                best_accuracy = max(r['accuracy_percent'] for r in test_results)
                min_distance = min(r['distance_km'] for r in test_results)
                analysis_progress[analysis_id]['results']['test_summary'] = {
                    'average_accuracy': round(avg_accuracy, 2),
                    'best_accuracy': round(best_accuracy, 2),
                    'minimum_distance_km': round(min_distance, 2)
                }
        
    except Exception as e:
        analysis_progress[analysis_id]['status'] = 'error'
        analysis_progress[analysis_id]['error'] = str(e)

@app.route('/get_results/<analysis_id>', methods=['GET'])
def get_analysis_results(analysis_id):
    """Récupère les résultats d'une analyse terminée"""
    progress = analysis_progress.get(analysis_id)
    if not progress:
        return jsonify({'success': False, 'error': 'Analyse introuvable'}), 404
    
    if progress['status'] == 'completed' and 'results' in progress:
        return jsonify(progress['results'])
    elif progress['status'] == 'error':
        return jsonify({'success': False, 'error': progress.get('error', 'Erreur inconnue')}), 500
    else:
        return jsonify({'success': False, 'error': 'Analyse en cours'}), 202

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

if __name__ == '__main__':
    # Créer le dossier static s'il n'existe pas
    os.makedirs('static', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=5000)