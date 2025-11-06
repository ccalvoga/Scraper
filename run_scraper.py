#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script para ejecutar Scrapy en un proceso separado de Flask.
Este script lee la configuración desde un archivo JSON y ejecuta el spider.
"""

import sys
import os
import json
import csv
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Agregar el directorio de Scrapy al path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
scrapy_project_dir = os.path.join(BASE_DIR, 'autoconsumo_scraper_scrapy')
sys.path.insert(0, scrapy_project_dir)

# Configurar el módulo de settings ANTES de importar cualquier cosa de Scrapy
# Configurar el módulo de settings ANTES de importar cualquier cosa de Scrapy
os.environ['SCRAPY_SETTINGS_MODULE'] = 'autoconsumo_scraper_scrapy.settings'

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from autoconsumo_scraper_scrapy.spiders.generic_spider import GenericSpider
from autoconsumo_scraper_scrapy.activity_log import write_activity


def normalize_text(text: str) -> str:
    """Normaliza texto removiendo acentos y convirtiendo a minúsculas"""
    text_norm = unicodedata.normalize('NFD', text)
    stripped = ''.join(
        c for c in text_norm if unicodedata.category(c) != 'Mn'
    )
    return stripped.lower()

def write_status(status_file: Optional[str], updates: dict) -> None:
    """Actualiza status.json de forma segura."""
    if not status_file:
        return
    try:
        current = {}
        status_path = Path(status_file)
        if status_path.exists():
            try:
                current = json.loads(status_path.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                current = {}
        current.update(updates)
        status_path.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception as exc:
        print(f"Advertencia al actualizar status.json: {exc}", file=sys.stderr)

def load_sources(csv_path: str) -> List[Dict[str, Any]]:
    """Carga las fuentes desde CSV devolviendo descripción, URL y columnas adicionales."""
    sources: List[Dict[str, Any]] = []
    with open(csv_path, 'r', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile, delimiter=';')
        for row in reader:
            if not row or len(row) < 2:
                continue
            description = (row[0] or '').strip()
            candidate_url = row[1].strip()
            if not candidate_url or not candidate_url.startswith('http'):
                continue
            extra = [col.strip() for col in row[2:] if col and col.strip()]
            sources.append({
                'description': description,
                'url': candidate_url,
                'extra': extra,
            })
    return sources


def load_start_urls(csv_path: str) -> List[str]:
    """Carga únicamente las URLs iniciales desde el CSV."""
    return [source['url'] for source in load_sources(csv_path)]

def build_summary(execution_dir: str, documents_dir: str, start_urls: List[str]) -> dict:
    """Genera el fichero procesados.md con un resumen básico de la ejecución."""
    exec_path = Path(execution_dir)
    docs_path = Path(documents_dir)
    procesados_path = exec_path / 'procesados.md'

    txt_files = sorted(docs_path.glob('*.txt'))
    html_files = sorted(docs_path.glob('*.html'))
    other_files = sorted(
        [p for p in docs_path.glob('*') if p.is_file() and p.suffix.lower() not in {'.txt', '.html'}]
    )

    lines = [
        "# Resumen de la ejecución",
        "",
        f"- Fecha de finalización: {datetime.now().isoformat(timespec='seconds')}",
        f"- URLs iniciales: {len(start_urls)}",
        f"- Archivos .txt generados: {len(txt_files)}",
        f"- Archivos .html generados: {len(html_files)}",
        f"- Otros archivos descargados: {len(other_files)}",
        ""
    ]

    if txt_files or html_files or other_files:
        lines.append("## Archivos guardados")
        lines.append("")
        for file_path in txt_files + html_files + other_files:
            size_kb = file_path.stat().st_size / 1024 if file_path.exists() else 0
            lines.append(f"- {file_path.name} ({size_kb:.1f} KB)")
    else:
        lines.append("No se generaron archivos en esta ejecución.")

    procesados_path.write_text("\n".join(lines), encoding='utf-8')
    return {
        'start_urls': len(start_urls),
        'txt_files': len(txt_files),
        'html_files': len(html_files),
        'other_files': len(other_files),
    }


def main(config_file_path):
    """
    Función principal que ejecuta el scraper.

    Args:
        config_file_path: Ruta al archivo JSON con la configuración
    """
    # 1. Leer configuración desde el archivo JSON
    with open(config_file_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    execution_dir = config['execution_dir']
    documents_dir = config['documents_dir']
    fuentes_file = config['fuentes_file']
    terminos_file = config['terminos_file']
    exclusiones_file = config['exclusiones_file']
    status_file = config.get('status_file')
    activity_log_file = os.path.join(execution_dir, 'activity.log')
    user_config = config['user_config']

    # Reiniciar activity log
    Path(activity_log_file).write_text("", encoding='utf-8')
    write_activity(activity_log_file, 'Sistema', 'INFO', f"Iniciando ejecución en {execution_dir}")

    # 2. Extraer configuración del usuario
    max_depth = user_config.get('max_depth', 3)
    crawl_strategy = user_config.get('crawl_strategy', 'continue')
    file_types = user_config.get('file_types', ['documents'])
    download_scope = user_config.get('download_scope', 'same-domain')
    path_restriction = user_config.get('path_restriction', 'base-path')
    save_page_text = user_config.get('save_page_text', True)
    save_html = user_config.get('save_html', True)

    write_activity(
        activity_log_file,
        'Sistema',
        'INFO',
        f"Config: profundidad={max_depth}, estrategia={crawl_strategy}, archivos={','.join(file_types)}, alcance={download_scope}, path={path_restriction}"
    )
    # 3. Leer URLs desde fuentes.csv
    sources: List[Dict[str, Any]] = []
    try:
        sources = load_sources(fuentes_file)
    except Exception as e:
        print(f"Error reading fuentes.csv: {e}", file=sys.stderr)
        write_status(status_file, {
            'status': 'error',
            'message': f'Error leyendo fuentes.csv: {e}',
            'finished_at': datetime.now().isoformat(timespec='seconds'),
            'current_url': None,
            'current_description': None,
            'current_index': 0
        })
        write_activity(activity_log_file, 'Sistema', 'ERROR', f"Error leyendo fuentes.csv: {e}")
        sys.exit(1)

    start_urls = [source['url'] for source in sources]
    if not start_urls:
        print("No se encontraron URLs en fuentes.csv", file=sys.stderr)
        write_status(status_file, {
            'status': 'error',
            'message': 'No se encontraron URLs válidas en fuentes.csv',
            'finished_at': datetime.now().isoformat(timespec='seconds'),
            'current_url': None,
            'current_description': None,
            'current_index': 0
        })
        write_activity(activity_log_file, 'Sistema', 'ERROR', "No se encontraron URLs válidas en fuentes.csv")
        sys.exit(1)

    write_activity(activity_log_file, 'Sistema', 'INFO', f"{len(start_urls)} URLs iniciales cargadas")

    source_lookup: Dict[str, Dict[str, Any]] = {
        source['url']: {
            'description': source.get('description', ''),
            'extra': source.get('extra', []),
            'index': idx
        }
        for idx, source in enumerate(sources)
    }

    # 4. Leer términos de interés
    keywords_map = {}
    if terminos_file and os.path.exists(terminos_file):
        with open(terminos_file, 'r', encoding='utf-8') as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith('#'):
                    keywords_map[normalize_text(stripped)] = stripped

    # 5. Leer exclusiones
    exclusions_map = {}
    if exclusiones_file and os.path.exists(exclusiones_file):
        with open(exclusiones_file, 'r', encoding='utf-8') as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith('#'):
                    exclusions_map[normalize_text(stripped)] = stripped

    # 6. Configurar Scrapy
    # Obtener los settings del proyecto (ya configurados vía SCRAPY_SETTINGS_MODULE)
    settings = get_project_settings()

    # Sobrescribir solo los settings específicos de esta ejecución
    log_file = os.path.join(execution_dir, 'scraper.log')
    settings.set('LOG_FILE', log_file, priority='cmdline')
    settings.set('FILES_STORE', documents_dir, priority='cmdline')
    settings.set('TEXT_FILES_STORE', documents_dir, priority='cmdline')
    settings.set('ACTIVITY_LOG_FILE', activity_log_file, priority='cmdline')

    custom_user_agent = user_config.get('user_agent') or (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )
    settings.set('USER_AGENT', custom_user_agent, priority='cmdline')
    settings.set('DEFAULT_REQUEST_HEADERS', {
        'User-Agent': custom_user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.idae.es/'
    }, priority='cmdline')

    # CRÍTICO: Cambiar LOG_LEVEL a INFO para NO loguear items a nivel DEBUG
    settings.set('LOG_LEVEL', 'INFO', priority='cmdline')

    # Asegurar que el LogFormatter personalizado esté activo
    settings.set('LOG_FORMATTER', 'autoconsumo_scraper_scrapy.logformatter.PoliteLogFormatter', priority='cmdline')

    # Verificar que los pipelines están habilitados
    print(f"Pipelines enabled: {settings.get('ITEM_PIPELINES')}")
    print(f"LOG_LEVEL: {settings.get('LOG_LEVEL')}")
    print(f"LOG_FORMATTER: {settings.get('LOG_FORMATTER')}")

    # 7. Crear y ejecutar el proceso de Scrapy
    process = CrawlerProcess(settings)

    def update_progress(processed: int, url: str, depth: int):
        total_sources = len(start_urls)
        capped_current = max(0, min(processed, total_sources))
        source_info = source_lookup.get(url, {})
        source_index = source_info.get('index')
        current_index = (
            source_index + 1
            if isinstance(source_index, int)
            else (capped_current if capped_current > 0 else 0)
        )
        description = source_info.get('description') or None
        progress_parts = []
        if total_sources:
            progress_parts.append(f"Procesando {capped_current}/{total_sources}")
        if description:
            progress_parts.append(description)
        elif url:
            progress_parts.append(url)
        progress_message = " · ".join(progress_parts) if progress_parts else "Scraping en progreso..."

        write_status(status_file, {
            'status': 'running',
            'current': capped_current,
            'total': total_sources,
            'current_url': url,
            'current_description': description,
            'current_index': current_index,
            'message': progress_message
        })
        write_activity(
            activity_log_file,
            'Scrapy',
            'INFO',
            f"Progreso {processed}/{len(start_urls)} · Depth ({depth}) · {url}",
            url_index=current_index if isinstance(current_index, int) and current_index > 0 else None
        )

    process.crawl(
        GenericSpider,
        start_urls=start_urls,
        keywords_map=keywords_map,
        exclusions_map=exclusions_map,
        max_depth=max_depth,
        crawl_strategy=crawl_strategy,
        file_types=file_types,
        download_scope=download_scope,
        path_restriction=path_restriction,
        save_page_text=save_page_text,
        save_html=save_html,
        status_updater=update_progress,
        activity_log_path=activity_log_file,
        source_lookup=source_lookup
    )

    # 8. Iniciar el scraping (bloqueante)
    print(f"Iniciando scraping con {len(start_urls)} URLs...")
    print(f"Profundidad máxima: {max_depth}")
    print(f"Estrategia: {crawl_strategy}")
    print(f"Tipos de archivo: {file_types}")
    print(f"Log file: {log_file}")

    try:
        process.start()  # Esto bloquea hasta que termine el scraping
        summary = build_summary(execution_dir, documents_dir, start_urls)
        write_activity(
            activity_log_file,
            'Sistema',
            'INFO',
            f"Resumen: textos={summary['txt_files']} · html={summary['html_files']} · otros={summary['other_files']}"
        )
        write_status(status_file, {
            'status': 'idle',
            'current': len(start_urls),
            'total': len(start_urls),
            'current_url': None,
            'current_description': None,
            'current_index': len(start_urls),
            'message': 'Scraping completado',
            'finished_at': datetime.now().isoformat(timespec='seconds')
        })
        write_activity(activity_log_file, 'Sistema', 'INFO', "Scraping completado correctamente")
        print("Scraping completado.")
    except Exception as exc:
        write_status(status_file, {
            'status': 'error',
            'message': f'Error durante la ejecución: {exc}',
            'current_url': None,
            'current_description': None,
            'finished_at': datetime.now().isoformat(timespec='seconds')
        })
        write_activity(activity_log_file, 'Sistema', 'ERROR', f"Error durante la ejecución: {exc}")
        raise


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python run_scraper.py <config_file_path>", file=sys.stderr)
        sys.exit(1)

    config_file = sys.argv[1]

    if not os.path.exists(config_file):
        print(f"Error: Config file not found: {config_file}", file=sys.stderr)
        sys.exit(1)

    try:
        main(config_file)
    except Exception as e:
        print(f"Error fatal: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
