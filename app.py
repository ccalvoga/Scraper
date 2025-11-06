from flask import Flask, render_template, request, jsonify
import os
import sys
import shutil
import json
import csv
import subprocess
from datetime import datetime
from typing import List

# Configuración simple sin imports externos problemáticos
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FUENTES_FILE = os.path.join(BASE_DIR, "fuentes.csv")
EXCLUSIONES_FILE = os.path.join(BASE_DIR, "exclusiones.txt")
TERMINOS_FILE = os.path.join(BASE_DIR, "terminos_interes.txt")
EJECUCIONES_DIR = os.path.join(BASE_DIR, "ejecuciones")
DOCUMENTS_DIR = os.path.join(BASE_DIR, "autoconsumo_documents")

# Crear directorios si no existen
os.makedirs(EJECUCIONES_DIR, exist_ok=True)
os.makedirs(DOCUMENTS_DIR, exist_ok=True)

app = Flask(__name__)

# ---- Global State ----
SCRAPER_PROCESS = None

# ---- Helpers ----
def timestamp_dir():
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

def copy_if_exists(src, dst_dir):
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(dst_dir, os.path.basename(src)))

def normalize_text(text: str) -> str:
    import unicodedata
    text_norm = unicodedata.normalize('NFD', text)
    stripped = ''.join(
        c for c in text_norm if unicodedata.category(c) != 'Mn'
    )
    return stripped.lower()

def extract_start_urls(csv_path: str) -> List[str]:
    """Lee fuentes.csv y devuelve las URLs válidas."""
    urls = []
    with open(csv_path, 'r', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile, delimiter=';')
        for row in reader:
            if row and len(row) > 1:
                candidate = row[1].strip()
                if candidate.startswith('http'):
                    urls.append(candidate)
    return urls

# ---- Rutas ----

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/files/<filename>', methods=['GET'])
def get_file(filename):
    allowed_files = {
        'fuentes.csv': FUENTES_FILE,
        'exclusiones.txt': EXCLUSIONES_FILE,
        'terminos_interes.txt': TERMINOS_FILE,
    }
    filepath = allowed_files.get(filename)
    if not filepath or not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({'content': content})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/files/<filename>', methods=['POST'])
def save_file(filename):
    allowed_files = {
        'fuentes.csv': FUENTES_FILE,
        'exclusiones.txt': EXCLUSIONES_FILE,
        'terminos_interes.txt': TERMINOS_FILE,
    }
    filepath = allowed_files.get(filename)
    if not filepath:
        return jsonify({'error': 'File not allowed'}), 400

    data = request.json
    if 'content' not in data:
        return jsonify({'error': 'Missing content'}), 400

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(data['content'])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scrape', methods=['POST'])
def start_scrape():
    global SCRAPER_PROCESS

    # Verificar si ya hay un proceso corriendo
    if SCRAPER_PROCESS and SCRAPER_PROCESS.poll() is None:
        return jsonify({'error': 'Un proceso de scraping ya está en ejecución.'}), 409

    # 1. Leer configuración del usuario
    user_config = request.json or {}

    # 2. Crear directorios de ejecución
    exec_name = timestamp_dir()
    current_execution_dir = os.path.join(EJECUCIONES_DIR, exec_name)
    os.makedirs(current_execution_dir)

    current_documents_dir = os.path.join(current_execution_dir, "autoconsumo_documents")
    os.makedirs(current_documents_dir)

    # 3. Copiar ficheros de entrada y trabajar siempre con el snapshot
    copy_if_exists(FUENTES_FILE, current_execution_dir)
    copy_if_exists(EXCLUSIONES_FILE, current_execution_dir)
    copy_if_exists(TERMINOS_FILE, current_execution_dir)

    local_fuentes = os.path.join(current_execution_dir, os.path.basename(FUENTES_FILE))
    local_exclusiones = os.path.join(current_execution_dir, os.path.basename(EXCLUSIONES_FILE))
    local_terminos = os.path.join(current_execution_dir, os.path.basename(TERMINOS_FILE))

    if not os.path.exists(local_fuentes):
        shutil.rmtree(current_execution_dir, ignore_errors=True)
        return jsonify({'error': 'No se encontró el fichero fuentes.csv'}), 400

    try:
        start_urls = extract_start_urls(local_fuentes)
    except Exception as exc:
        shutil.rmtree(current_execution_dir, ignore_errors=True)
        return jsonify({'error': f'Error leyendo fuentes.csv: {exc}'}), 500

    if not start_urls:
        shutil.rmtree(current_execution_dir, ignore_errors=True)
        return jsonify({'error': 'fuentes.csv no contiene URLs válidas'}), 400

    total_urls = len(start_urls)

    # 4. Guardar configuración en JSON
    config_file = os.path.join(current_execution_dir, 'scraper_config.json')
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump({
            'execution_dir': current_execution_dir,
            'documents_dir': current_documents_dir,
            'fuentes_file': local_fuentes,
            'terminos_file': local_terminos if os.path.exists(local_terminos) else None,
            'exclusiones_file': local_exclusiones if os.path.exists(local_exclusiones) else None,
            'status_file': os.path.join(BASE_DIR, 'status.json'),
            'user_config': user_config
        }, f, indent=2)

    # 5. Inicializar estado de la ejecución
    status_path = os.path.join(BASE_DIR, 'status.json')
    status_payload = {
        'status': 'running',
        'current': 0,
        'total': total_urls,
        'current_index': 0,
        'current_url': None,
        'current_description': None,
        'message': f'Ejecución {exec_name} en progreso',
        'execution': exec_name,
        'started_at': datetime.now().isoformat(timespec='seconds')
    }
    try:
        with open(status_path, 'w', encoding='utf-8') as status_file:
            json.dump(status_payload, status_file, ensure_ascii=False)
    except Exception as exc:
        shutil.rmtree(current_execution_dir, ignore_errors=True)
        return jsonify({'error': f'No se pudo inicializar el estado: {exc}'}), 500

    # 5. Ejecutar Scrapy en proceso separado
    script_path = os.path.join(BASE_DIR, 'run_scraper.py')

    try:
        SCRAPER_PROCESS = subprocess.Popen(
            [sys.executable, script_path, config_file],
            cwd=BASE_DIR,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        return jsonify({'message': f'Scraping iniciado en la carpeta de ejecución: {exec_name}'})
    except Exception as e:
        shutil.rmtree(current_execution_dir, ignore_errors=True)
        try:
            with open(status_path, 'w', encoding='utf-8') as status_file:
                json.dump({
                    'status': 'error',
                    'current': 0,
                    'total': total_urls,
                    'current_index': 0,
                    'current_url': None,
                    'current_description': None,
                    'message': f'Error al iniciar el scraping: {e}',
                    'execution': exec_name,
                    'finished_at': datetime.now().isoformat(timespec='seconds')
                }, status_file, ensure_ascii=False)
        except Exception:
            pass
        return jsonify({'error': f'Error al iniciar el scraping: {e}'}), 500

@app.route('/api/scrape/cancel', methods=['POST'])
def cancel_scrape():
    global SCRAPER_PROCESS
    if SCRAPER_PROCESS and SCRAPER_PROCESS.poll() is None:
        SCRAPER_PROCESS.terminate()

        # Actualizar el archivo de estado a idle
        status_path = os.path.join(BASE_DIR, 'status.json')
        if os.path.exists(status_path):
            try:
                with open(status_path, 'r', encoding='utf-8') as f:
                    status = json.load(f)
                status['status'] = 'idle'
                status['message'] = 'Cancelado por el usuario'
                status['current_url'] = None
                status['current_description'] = None
                status['current_index'] = status.get('current', 0)
                with open(status_path, 'w', encoding='utf-8') as f:
                    json.dump(status, f, ensure_ascii=False)
            except Exception as e:
                print(f"Error updating status file: {e}")

        return jsonify({'message': 'Scraping cancelado correctamente'})
    return jsonify({'error': 'No hay scraping activo'}), 404

@app.route('/api/scrape_status', methods=['GET'])
def scrape_status():
    status_path = os.path.join(BASE_DIR, 'status.json')
    if not os.path.exists(status_path):
        return jsonify({
            'status': 'idle',
            'current': 0,
            'total': 0,
            'current_index': 0,
            'current_url': None,
            'current_description': None
        })

    try:
        with open(status_path, 'r', encoding='utf-8') as f:
            status = json.load(f)

        # Comprobar si el proceso sigue vivo
        is_crawling = False
        if SCRAPER_PROCESS:
            is_crawling = SCRAPER_PROCESS.poll() is None

        if status.get('status') == 'running' and not is_crawling:
            status['status'] = 'idle'
            status['current_url'] = None
            status['current_description'] = None
            status['current_index'] = status.get('current', 0)
            with open(status_path, 'w', encoding='utf-8') as f:
                json.dump(status, f, ensure_ascii=False)

        return jsonify(status)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/procesados', methods=['GET'])
def get_procesados():
    if not os.path.exists(EJECUCIONES_DIR) or not os.listdir(EJECUCIONES_DIR):
        return jsonify({'content': ''})

    try:
        latest_exec = sorted(os.listdir(EJECUCIONES_DIR), reverse=True)[0]
        latest_exec_path = os.path.join(EJECUCIONES_DIR, latest_exec)
        filepath = os.path.join(latest_exec_path, 'procesados.md')

        if not os.path.exists(filepath):
            return jsonify({'content': f'# Ejecución: {latest_exec}\n\n*Procesando...*'})

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        content_with_header = f'# Ejecución: {latest_exec}\n\n{content}'
        return jsonify({'content': content_with_header})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/logs', methods=['GET'])
def get_logs():
    if not os.path.exists(EJECUCIONES_DIR) or not os.listdir(EJECUCIONES_DIR):
        return jsonify({'content': 'Aún no hay ejecuciones.'})

    try:
        latest_exec = sorted(os.listdir(EJECUCIONES_DIR), reverse=True)[0]
        latest_exec_path = os.path.join(EJECUCIONES_DIR, latest_exec)
        activity_log_path = os.path.join(latest_exec_path, 'activity.log')
        log_filepath = activity_log_path if os.path.exists(activity_log_path) else os.path.join(latest_exec_path, 'scraper.log')

        if not os.path.exists(log_filepath):
            return jsonify({'content': 'Esperando inicio del scraper...'})

        # Leer solo las últimas 500 líneas para evitar bloqueos
        max_lines = 500
        with open(log_filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()

        # Si hay más líneas que el máximo, tomar solo las últimas
        if len(lines) > max_lines:
            content = f'... (mostrando últimas {max_lines} líneas de {len(lines)} totales)\n\n'
            content += ''.join(lines[-max_lines:])
        else:
            content = ''.join(lines)

        return jsonify({'content': content})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("=" * 60)
    print("AUTOCONSUMO WEB SCRAPER")
    print("=" * 60)
    print(f"Directorio base: {BASE_DIR}")
    print(f"Puerto: 5001")
    print(f"URL: http://localhost:5001")
    print("=" * 60)
    print("\nPresiona Ctrl+C para detener el servidor\n")

    app.run(debug=False, port=5001, threaded=True)
