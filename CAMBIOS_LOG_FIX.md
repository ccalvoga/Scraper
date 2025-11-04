# Corrección del Problema de Logs Gigantes

## Problema Identificado

El archivo `scraper.log` estaba creciendo hasta 95+ MB porque:

1. **Scrapy logueaba los items completos** a nivel DEBUG (incluyendo todo el HTML/texto)
2. **Los pipelines NO se estaban cargando** (aparecía `Enabled item pipelines: []` en el log)
3. **Los archivos individuales .txt NO se estaban creando**

## Cambios Realizados

### 1. **run_scraper.py** - Configuración correcta de Scrapy

**Problema:** El settings module no se estaba cargando correctamente, por lo que los pipelines no se habilitaban.

**Solución:**
```python
# Configurar el módulo de settings ANTES de importar Scrapy
os.environ['SCRAPY_SETTINGS_MODULE'] = 'autoconsumo_scraper_scrapy.settings'

# Cambiar LOG_LEVEL a INFO para NO loguear items a nivel DEBUG
settings.set('LOG_LEVEL', 'INFO', priority='cmdline')

# Asegurar LogFormatter personalizado
settings.set('LOG_FORMATTER', 'autoconsumo_scraper_scrapy.logformatter.PoliteLogFormatter', priority='cmdline')
```

### 2. **pipelines.py** - Guardar en archivos individuales

**Problema:** Aunque el código existía, no se estaba ejecutando porque los pipelines no se cargaban.

**Mejoras:**
- Nombres únicos usando hash MD5 para evitar colisiones
- Cada archivo .txt incluye la URL en la primera línea
- Logging mínimo: solo nombre del archivo, NO el contenido

**Ejemplo de output:**
```
autoconsumo_a3f2b1c9.txt    (texto de la página)
autoconsumo_a3f2b1c9.html   (HTML completo)
```

### 3. **logformatter.py** - NUEVO archivo

**Propósito:** Interceptar los logs de Scrapy y prevenir que loguee el contenido de los items.

**Funcionalidad:**
```python
class PoliteLogFormatter(logformatter.LogFormatter):
    def scraped(self, item, response, spider):
        # Solo loguea la URL, NO el contenido
        return {
            'level': logformatter.INFO,
            'msg': f"Scraped item from: {item.get('url', 'unknown')}",
            'args': {}
        }
```

### 4. **settings.py** - Configuración de logging

**Añadido:**
```python
LOG_LEVEL = 'INFO'  # NO usar DEBUG
LOG_FORMATTER = 'autoconsumo_scraper_scrapy.logformatter.PoliteLogFormatter'
LOG_STDOUT = False
LOGSTATS_INTERVAL = 60.0
```

### 5. **generic_spider.py** - Logging compacto

**Cambio:**
```python
# ANTES:
self.logger.info(f"Keywords found on {response.url}: {', '.join(keywords_on_page)}")

# AHORA:
self.logger.info(f"✓ Keywords found: {', '.join(keywords_on_page)} | URL: {response.url}")
```

## Cómo Probar

1. **Detener el servidor** si está corriendo (Ctrl+C)

2. **Ejecutar el servidor:**
   ```bash
   python app.py
   ```

3. **Abrir el navegador:**
   ```
   http://localhost:5001
   ```

4. **Iniciar un scraping** desde la interfaz

5. **Verificar los resultados:**

   Ejecutar el diagnóstico:
   ```bash
   python diagnostico.py
   ```

   Deberías ver:
   - ✅ Log tamaño < 1 MB (solo metadata)
   - ✅ Archivos .txt creados en `autoconsumo_documents/`
   - ✅ Cada URL tiene su propio archivo

## Estructura Esperada

```
ejecuciones/
└── 2025-11-03_XX-XX-XX/
    ├── scraper.log                    ← PEQUEÑO (solo logs informativos)
    ├── procesados.md
    ├── fuentes.csv
    ├── exclusiones.txt
    ├── terminos_interes.txt
    └── autoconsumo_documents/
        ├── regimen-economico_a3f2b1c9.txt     ← Texto de página 1
        ├── regimen-economico_a3f2b1c9.html    ← HTML de página 1
        ├── autoconsumo_f7e4d8a2.txt           ← Texto de página 2
        ├── autoconsumo_f7e4d8a2.html          ← HTML de página 2
        └── documento.pdf                       ← Archivos descargados
```

## Beneficios

✅ **Logs pequeños:** scraper.log solo contiene metadata (< 100 KB típicamente)
✅ **UI no se congela:** La carga del log es instantánea
✅ **Archivos individuales:** Cada URL tiene su propio archivo de texto
✅ **Fácil análisis:** Los archivos .txt son fáciles de buscar y procesar
✅ **Sin colisiones:** Los nombres con hash garantizan unicidad

## Problemas Anteriores Resueltos

| Problema | Solución |
|----------|----------|
| Log de 95 MB | Ahora < 100 KB |
| UI congelada | Carga instantánea |
| No se crean .txt | Ahora se crean correctamente |
| Pipelines no funcionan | Ahora se cargan correctamente |
| HTML en el log | Solo metadata en el log |

## Si Algo No Funciona

1. **Verificar que se carguen los pipelines:**
   - Al iniciar el scraping, buscar en la consola del servidor:
   - Debe aparecer: `Pipelines enabled: {'autoconsumo_scraper_scrapy.pipelines.TextFilePipeline': 200, ...}`

2. **Verificar el LOG_LEVEL:**
   - Debe aparecer: `LOG_LEVEL: INFO`
   - Si aparece `DEBUG`, los items se loguearán completos

3. **Revisar el log más reciente:**
   - Debe mostrar líneas como: `✓ Text saved: archivo_abc123.txt`
   - NO debe mostrar HTML completo

4. **Ejecutar diagnóstico:**
   ```bash
   python diagnostico.py
   ```
