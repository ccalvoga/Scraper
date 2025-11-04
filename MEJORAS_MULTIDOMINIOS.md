# Mejoras: Soporte Multi-Dominio

## 🎯 Objetivo
Permitir que el scraper funcione con URLs de **múltiples dominios** diferentes, no solo `www.miteco.gob.es`.

## ✨ Cambios Realizados

### 1. **Nuevo Spider Genérico** (`generic_spider.py`)
- **Antes**: `MitecoSpider` con `allowed_domains = ["www.miteco.gob.es"]` hardcodeado
- **Ahora**: `GenericSpider` que extrae dominios dinámicamente de las URLs

#### Extracción Dinámica de Dominios
```python
# En __init__ del spider:
self.allowed_domains = list(set([urlparse(url).netloc for url in start_urls if url]))
```

**Ejemplo**:
Si `fuentes.csv` contiene:
```csv
descripcion1;https://www.miteco.gob.es/es/energia/renovables/
descripcion2;https://www.idae.es/tecnologias/energias-renovables
descripcion3;https://www.boe.es/buscar/act.php
```

El spider automáticamente permitirá:
- `www.miteco.gob.es`
- `www.idae.es`
- `www.boe.es`

### 2. **Actualización de `app.py`**
- Cambio del import: `MitecoSpider` → `GenericSpider`
- Agregados imports faltantes: `sys`, `datetime`, `config as cfg`
- El resto de la lógica permanece igual

### 3. **Mejora en la Lógica de Crawling**
```python
# Antes:
if target_domain == self.allowed_domains[0] and target_path.startswith(base_path):

# Ahora:
if target_domain in self.allowed_domains and target_path.startswith(base_path):
```

Esto permite que el spider:
- ✅ Navegue por cualquier dominio que esté en `fuentes.csv`
- ✅ Respete la restricción de directorio base (no sale del path inicial)
- ✅ Respete la profundidad máxima (`max_depth`)

## 📋 Ejemplo de Uso

### Archivo `fuentes.csv`
```csv
faq regimen retribucion energias renovables;https://www.miteco.gob.es/es/energia/renovables/regimen-economico-energias-renovables.html
energia renovable idae;https://www.idae.es/tecnologias/energias-renovables
normativa autoconsumo;https://www.boe.es/buscar/act.php?id=BOE-A-2019-5089
subvenciones autoconsumo;https://www.comunidad.madrid/servicios/medio-ambiente/ayudas-instalaciones-autoconsumo
```

### Archivo `terminos_interes.txt`
```
autoconsumo
energía renovable
placas solares
fotovoltaica
subvenciones
```

### Archivo `exclusiones.txt`
```
error
página no encontrada
404
```

### Resultado
El scraper:
1. **Crawleará** todas las URLs de diferentes dominios
2. **Filtrará** páginas que contengan palabras clave
3. **Excluirá** ramas con términos prohibidos
4. **Descargará** PDFs y documentos relacionados
5. **Guardará** todo en `ejecuciones/{timestamp}/`

## 🔧 Configuración

### Profundidad de Crawling
Por defecto: `max_depth=3`

Para cambiar, modificar en `app.py:129`:
```python
max_depth = request.json.get('max_depth', 3)  # Cambiar el 3
```

### Formatos de Archivo Soportados
```python
recognized_exts = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'}
```

Para agregar más formatos, editar `generic_spider.py:76`.

## ⚠️ Restricciones Mantenidas

1. **Scope por Directorio**: Solo sigue enlaces dentro del directorio base
   - ✅ `/es/energia/renovables/` → `/es/energia/renovables/autoconsumo/`
   - ❌ `/es/energia/renovables/` → `/es/agua/`

2. **Robots.txt**: Respeta las reglas de cada sitio

3. **Rate Limiting**:
   - 1 petición por dominio simultánea
   - 1 segundo de delay entre peticiones

## 📊 Compatibilidad

### Compatible con:
- ✅ Múltiples dominios simultáneos
- ✅ HTTP y HTTPS
- ✅ URLs con parámetros (`?id=123`)
- ✅ Subdominios diferentes (`www.example.com`, `blog.example.com`)

### No compatible con:
- ❌ Sitios con JavaScript rendering (SPA)
- ❌ Sitios que requieren autenticación
- ❌ Contenido dinámico cargado por AJAX

## 🚀 Próximas Mejoras Potenciales

1. **Soporte para JavaScript**: Integrar Scrapy-Splash o Selenium
2. **Autenticación**: Login forms y OAuth
3. **Base de Datos**: Guardar en PostgreSQL/SQLite
4. **Export Avanzado**: JSON, CSV, XML
5. **Notificaciones**: Email/Webhook al completar
6. **Dashboard**: Visualización de resultados en tiempo real
7. **Scheduler**: Ejecuciones programadas

## 📝 Notas Técnicas

### Normalización de Texto
La función `normalize_text()` maneja:
- Acentos: `energía` → `energia`
- Mayúsculas: `RENOVABLE` → `renovable`
- Diacríticos: `ñ` se mantiene como `ñ`

### Logs
Ubicación: `ejecuciones/{timestamp}/scraper.log`

Ver en tiempo real:
```bash
GET /api/logs
```

### Estado del Scraper
```bash
GET /api/scrape_status
```

Respuesta:
```json
{
  "status": "running|idle|error",
  "current": 0,
  "total": 0
}
```
