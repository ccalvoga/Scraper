#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script de diagnóstico para verificar la configuración de la aplicación
Y analizar el tamaño de los logs y archivos generados
"""

import os
import sys
import glob

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def check_file(path, description):
    """Verifica si un archivo existe"""
    full_path = os.path.join(BASE_DIR, path) if not os.path.isabs(path) else path
    exists = os.path.exists(full_path)
    status = "✅" if exists else "❌"
    print(f"{status} {description}: {path}")
    if exists and os.path.isfile(full_path):
        size = os.path.getsize(full_path)
        print(f"   Tamaño: {size} bytes")
    return exists

def check_directory(path, description):
    """Verifica si un directorio existe"""
    full_path = os.path.join(BASE_DIR, path) if not os.path.isabs(path) else path
    exists = os.path.exists(full_path) and os.path.isdir(full_path)
    status = "✅" if exists else "❌"
    print(f"{status} {description}: {path}")
    return exists

print("=" * 60)
print("DIAGNÓSTICO DE LA APLICACIÓN WEB SCRAPER")
print("=" * 60)

print("\n📁 ARCHIVOS PRINCIPALES:")
check_file("app.py", "Servidor Flask")
check_file("run_scraper.py", "Script de Scrapy")
check_file("config.py", "Configuración")

print("\n📁 ARCHIVOS DE ENTRADA:")
check_file("fuentes.csv", "Fuentes (URLs)")
check_file("terminos_interes.txt", "Términos de interés")
check_file("exclusiones.txt", "Exclusiones")

print("\n📁 ARCHIVOS FRONTEND:")
check_file("templates/index.html", "Plantilla HTML")
check_file("static/style.css", "Estilos CSS")
check_file("static/script.js", "JavaScript")

print("\n📁 PROYECTO SCRAPY:")
check_directory("autoconsumo_scraper_scrapy", "Directorio Scrapy")
check_file("autoconsumo_scraper_scrapy/scrapy.cfg", "Config Scrapy")
check_file("autoconsumo_scraper_scrapy/autoconsumo_scraper_scrapy/spiders/generic_spider.py", "Spider genérico")
check_file("autoconsumo_scraper_scrapy/autoconsumo_scraper_scrapy/pipelines.py", "Pipelines")
check_file("autoconsumo_scraper_scrapy/autoconsumo_scraper_scrapy/settings.py", "Settings")

print("\n📁 DIRECTORIOS:")
check_directory("ejecuciones", "Directorio de ejecuciones")
check_directory("templates", "Directorio de templates")
check_directory("static", "Directorio de estáticos")

print("\n🔍 VERIFICACIÓN DE SINTAXIS:")
files_to_check = [
    "app.py",
    "run_scraper.py",
    "config.py"
]

for file in files_to_check:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            compile(f.read(), file, 'exec')
        print(f"✅ {file} - Sintaxis correcta")
    except SyntaxError as e:
        print(f"❌ {file} - Error de sintaxis: {e}")
    except Exception as e:
        print(f"⚠️ {file} - Error: {e}")

print("\n📦 MÓDULOS REQUERIDOS:")
required_modules = [
    "flask",
    "scrapy",
    "twisted"
]

for module in required_modules:
    try:
        __import__(module)
        print(f"✅ {module} - Instalado")
    except ImportError:
        print(f"❌ {module} - NO instalado")

print("\n" + "=" * 60)
print("FIN DEL DIAGNÓSTICO")
print("=" * 60)

# Verificar que script.js tenga contenido
script_js_path = os.path.join(BASE_DIR, "static", "script.js")
if os.path.exists(script_js_path):
    size = os.path.getsize(script_js_path)
    print(f"\n📝 script.js tiene {size} bytes")
    if size == 0:
        print("⚠️ ADVERTENCIA: script.js está vacío!")
    elif size < 100:
        print("⚠️ ADVERTENCIA: script.js parece muy pequeño!")
    else:
        print("✅ script.js parece tener contenido correcto")

print("\n" + "=" * 60)
print("ANÁLISIS DE EJECUCIONES")
print("=" * 60)

# Analizar la última ejecución
ejecuciones_dir = os.path.join(BASE_DIR, "ejecuciones")
if os.path.exists(ejecuciones_dir):
    ejecuciones = sorted([d for d in os.listdir(ejecuciones_dir)
                         if os.path.isdir(os.path.join(ejecuciones_dir, d))], reverse=True)

    if ejecuciones:
        ultima = ejecuciones[0]
        exec_path = os.path.join(ejecuciones_dir, ultima)
        print(f"\n📁 Última ejecución: {ultima}")

        # Analizar log
        log_file = os.path.join(exec_path, "scraper.log")
        if os.path.exists(log_file):
            log_size = os.path.getsize(log_file)
            print(f"\n📄 Log del scraper:")
            print(f"   Tamaño: {log_size:,} bytes ({log_size / 1024:.2f} KB)")

            if log_size > 1_000_000:
                print(f"   ⚠️  ADVERTENCIA: Log muy grande (>{log_size / 1024 / 1024:.2f} MB)")
                print(f"   Esto indica que el contenido de las páginas se está guardando en el log")
            else:
                print(f"   ✅ Tamaño razonable del log")

        # Analizar archivos de texto
        docs_dir = os.path.join(exec_path, "autoconsumo_documents")
        if os.path.exists(docs_dir):
            txt_files = glob.glob(os.path.join(docs_dir, "*.txt"))
            html_files = glob.glob(os.path.join(docs_dir, "*.html"))

            print(f"\n📦 Archivos generados:")
            print(f"   Archivos .txt: {len(txt_files)}")
            print(f"   Archivos .html: {len(html_files)}")

            if txt_files:
                total_txt = sum(os.path.getsize(f) for f in txt_files)
                print(f"   Tamaño total .txt: {total_txt:,} bytes ({total_txt / 1024:.2f} KB)")
                print(f"   ✅ Archivos individuales creados correctamente")

                # Mostrar ejemplos
                print(f"\n   Primeros archivos .txt:")
                for f in txt_files[:3]:
                    name = os.path.basename(f)
                    size = os.path.getsize(f)
                    print(f"   - {name} ({size:,} bytes)")
            else:
                print(f"   ⚠️  No se encontraron archivos .txt")
    else:
        print("\n⚠️  No hay ejecuciones disponibles")
else:
    print("\n⚠️  Directorio de ejecuciones no existe")

print("\n💡 SIGUIENTE PASO:")
print("1. Si ves errores arriba, corrígelos primero")
print("2. Ejecuta: python app.py")
print("3. Abre el navegador en http://localhost:5001")
print("4. Presiona F12 para abrir herramientas de desarrollo")
print("5. Ve a la pestaña 'Console' y busca errores en rojo")
print("6. Ve a la pestaña 'Network' y verifica que script.js se cargue (200 OK)")
