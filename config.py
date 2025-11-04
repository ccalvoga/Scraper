import os

# ---- Rutas Base ----
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# ---- Archivos de Entrada ----
FUENTES_FILE = os.path.join(BASE_DIR, "fuentes.csv")
EXCLUSIONES_FILE = os.path.join(BASE_DIR, "exclusiones.txt")
TERMINOS_FILE = os.path.join(BASE_DIR, "terminos_interes.txt")

# ---- Directorios de Salida ----
EJECUCIONES_DIR = os.path.join(BASE_DIR, "ejecuciones")
DOCUMENTS_DIR = os.path.join(BASE_DIR, "autoconsumo_documents") # Nombre unificado

# ---- Archivos de Salida ----
PROCESADOS_DEFAULT = os.path.join(BASE_DIR, "procesados.md")

# ---- Configuración del Scraper ----
USER_AGENT = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:79.0) Gecko/20100101 Firefox/79.0'

# ---- Inicialización de Directorios ----
def inicializar_directorios():
    """Asegura que los directorios de salida existan."""
    os.makedirs(EJECUCIONES_DIR, exist_ok=True)
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)

# Llamar a la función para crear los directorios al importar
inicializar_directorios()
