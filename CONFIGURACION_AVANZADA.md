# 📚 Guía de Configuración Avanzada

## 🎯 Resumen
Esta aplicación permite configurar completamente el comportamiento del scraper desde la interfaz web. Todas las opciones son personalizables según tus necesidades.

---

## ⚙️ Opciones Disponibles

### 1. 📊 **Control de Profundidad**

**Parámetro**: `max_depth`
**Tipo**: Número (0-10)
**Por defecto**: 3

**Descripción**: Controla cuántos niveles de enlaces seguirá el scraper desde las URLs iniciales.

**Ejemplos**:

```
URL inicial: https://ejemplo.com/docs/

max_depth = 0:
  ✅ https://ejemplo.com/docs/ (solo esta)
  ❌ No sigue ningún enlace

max_depth = 1:
  ✅ https://ejemplo.com/docs/
  ✅ https://ejemplo.com/docs/guia.html (nivel 1)
  ❌ https://ejemplo.com/docs/guia/detalle.html (nivel 2)

max_depth = 3:
  ✅ https://ejemplo.com/docs/
  ✅ https://ejemplo.com/docs/guia.html (nivel 1)
  ✅ https://ejemplo.com/docs/guia/detalle.html (nivel 2)
  ✅ https://ejemplo.com/docs/guia/detalle/anexo.html (nivel 3)
  ❌ https://ejemplo.com/docs/guia/detalle/anexo/subpagina.html (nivel 4)
```

---

### 2. 🔍 **Comportamiento sin Términos de Interés**

**Parámetro**: `crawl_strategy`
**Opciones**:
- `continue` (por defecto)
- `stop`

#### Opción A: `continue` - Continuar crawleando
**Comportamiento**: Sigue navegando aunque la página actual no tenga términos de interés.

**Ejemplo**:
```
Página A (sin términos) → No guarda nada, pero SÍ sigue sus enlaces
  ├─ Página B (con términos) → Guarda texto + archivos
  ├─ Página C (sin términos) → No guarda nada, pero SÍ sigue sus enlaces
  │   └─ Página D (con términos) → Guarda texto + archivos
  └─ Página E (con términos) → Guarda texto + archivos
```

**Ventajas**:
- ✅ Más exhaustivo - encuentra términos en páginas profundas
- ✅ Útil cuando la estructura del sitio tiene páginas de navegación sin contenido

**Desventajas**:
- ⚠️ Más lento - crawlea más páginas
- ⚠️ Puede scrapear secciones irrelevantes

---

#### Opción B: `stop` - Detener rama
**Comportamiento**: Si una página no tiene términos de interés, NO sigue sus enlaces.

**Ejemplo**:
```
Página A (con términos) → Guarda texto + archivos, SÍ sigue enlaces
  ├─ Página B (con términos) → Guarda texto + archivos, SÍ sigue enlaces
  │   └─ Página D (con términos) → Guarda texto + archivos
  ├─ Página C (sin términos) → ❌ DETIENE esta rama (no sigue enlaces)
  │   └─ Página E (nunca la visita)
  └─ Página F (con términos) → Guarda texto + archivos
```

**Ventajas**:
- ✅ Más rápido - solo crawlea ramas relevantes
- ✅ Más preciso - se enfoca en contenido relacionado

**Desventajas**:
- ⚠️ Puede perder contenido relevante detrás de páginas de navegación

**Recomendación**: Usa `continue` para exploración inicial, `stop` para scraping recurrente de sitios conocidos.

---

### 3. 📥 **Tipos de Archivos a Descargar**

**Parámetro**: `file_types`
**Tipo**: Array de strings
**Opciones**:
- `documents` (por defecto)
- `images`
- `archives`
- `other`

#### Categorías de Archivos:

**documents**:
- `.pdf` - Documentos PDF
- `.doc`, `.docx` - Microsoft Word
- `.xls`, `.xlsx` - Microsoft Excel
- `.ppt`, `.pptx` - Microsoft PowerPoint

**images**:
- `.jpg`, `.jpeg` - Imágenes JPEG
- `.png` - Imágenes PNG
- `.gif` - Imágenes GIF
- `.svg` - Gráficos vectoriales
- `.webp` - Imágenes WebP
- `.bmp` - Bitmaps

**archives**:
- `.zip` - Archivos ZIP
- `.rar` - Archivos RAR
- `.7z` - Archivos 7-Zip
- `.tar`, `.gz`, `.bz2` - Archivos comprimidos Unix/Linux

**other**:
- `.txt` - Archivos de texto plano
- `.csv` - Datos CSV
- `.json` - Datos JSON
- `.xml` - Documentos XML
- `.md` - Archivos Markdown

**Ejemplos de Combinaciones**:

```javascript
// Solo documentos (configuración por defecto)
file_types: ['documents']
→ Descarga: PDF, DOC, XLS, PPT

// Documentos + Imágenes
file_types: ['documents', 'images']
→ Descarga: PDF, DOC, XLS, PPT, JPG, PNG, GIF, SVG

// Todo excepto archivos comprimidos
file_types: ['documents', 'images', 'other']
→ Descarga: PDF, DOC, JPG, PNG, TXT, JSON, etc.

// Absolutamente todo
file_types: ['documents', 'images', 'archives', 'other']
→ Descarga: Cualquier archivo reconocido
```

**⚠️ Advertencia**: Seleccionar `images` puede aumentar significativamente el volumen de descargas.

---

### 4. 🌐 **Alcance de Descargas**

**Parámetro**: `download_scope`
**Opciones**:
- `same-domain` (por defecto)
- `any-domain`

#### Opción A: `same-domain` - Solo del mismo dominio
**Comportamiento**: Solo descarga archivos alojados en el mismo dominio que la página actual.

**Ejemplo**:
```
Página: https://www.ejemplo.com/docs/guia.html

Archivos en la página:
✅ https://www.ejemplo.com/files/manual.pdf (mismo dominio) → DESCARGA
❌ https://externa.com/documento.pdf (dominio diferente) → NO DESCARGA
✅ https://cdn.ejemplo.com/guia.pdf (subdominio de ejemplo.com) → DESCARGA
```

**Ventajas**:
- ✅ Más seguro - solo contenido oficial del sitio
- ✅ Evita descargar archivos de terceros
- ✅ Menos espacio de almacenamiento

---

#### Opción B: `any-domain` - Cualquier dominio
**Comportamiento**: Descarga archivos de cualquier URL, sin importar el dominio.

**Ejemplo**:
```
Página: https://www.ejemplo.com/docs/guia.html

Archivos en la página:
✅ https://www.ejemplo.com/files/manual.pdf → DESCARGA
✅ https://externa.com/documento.pdf → DESCARGA
✅ https://otroservidor.net/presentacion.ppt → DESCARGA
✅ https://cdn.cloudflare.com/ajax/libs/archivo.pdf → DESCARGA
```

**Ventajas**:
- ✅ Más completo - captura todas las referencias
- ✅ Útil para sitios que alojan archivos en CDNs externos

**Desventajas**:
- ⚠️ Puede descargar contenido no relacionado
- ⚠️ Mayor consumo de ancho de banda

**Recomendación**: Usa `same-domain` para sitios corporativos, `any-domain` para scraping académico/investigación.

---

### 5. 📂 **Restricción de Directorio**

**Parámetro**: `path_restriction`
**Opciones**:
- `base-path` (por defecto)
- `same-domain`

#### Opción A: `base-path` - Solo directorio base
**Comportamiento**: Solo crawlea URLs que estén dentro del directorio base de la URL inicial.

**Ejemplo**:
```
URL inicial: https://www.ejemplo.com/es/energia/renovables/

Directorio base detectado: /es/energia/renovables/

Enlaces encontrados:
✅ /es/energia/renovables/autoconsumo.html → SIGUE (dentro del base path)
✅ /es/energia/renovables/solar/fotovoltaica.html → SIGUE (subdirectorio)
❌ /es/energia/fosiles/carbon.html → NO SIGUE (fuera del base path)
❌ /es/agua/recursos.html → NO SIGUE (fuera del base path)
❌ /en/energy/renewables/ → NO SIGUE (diferente idioma)
```

**Ventajas**:
- ✅ Muy preciso - solo la sección específica
- ✅ Evita salirse del tema
- ✅ Más rápido para secciones grandes de un sitio

---

#### Opción B: `same-domain` - Todo el dominio
**Comportamiento**: Crawlea cualquier URL del mismo dominio, sin restricción de directorio.

**Ejemplo**:
```
URL inicial: https://www.ejemplo.com/es/energia/renovables/

Enlaces encontrados:
✅ /es/energia/renovables/autoconsumo.html → SIGUE
✅ /es/energia/fosiles/carbon.html → SIGUE (mismo dominio)
✅ /es/agua/recursos.html → SIGUE (mismo dominio)
✅ /en/energy/renewables/ → SIGUE (mismo dominio, diferente idioma)
✅ /blog/articulo.html → SIGUE (mismo dominio)
❌ https://otro-sitio.com/pagina.html → NO SIGUE (dominio diferente)
```

**Ventajas**:
- ✅ Más exhaustivo - cubre todo el sitio
- ✅ Útil para scraping completo de un dominio

**Desventajas**:
- ⚠️ Puede scrapear secciones irrelevantes
- ⚠️ Mucho más lento
- ⚠️ Mayor volumen de datos

**Recomendación**: Usa `base-path` para temas específicos, `same-domain` para scraping completo del sitio.

---

### 6. 💾 **Opciones de Guardado**

#### Opción A: Guardar texto completo
**Parámetro**: `save_page_text`
**Tipo**: Boolean
**Por defecto**: `true`

**Comportamiento**: Extrae y guarda todo el texto visible de la página en formato `.txt`.

**Contenido guardado**: Solo el texto (sin HTML, CSS, JavaScript)

**Ejemplo de archivo generado**:
```
autoconsumo.html.txt:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Autoconsumo Fotovoltaico

El autoconsumo fotovoltaico permite a los
usuarios generar su propia energía renovable...

Ventajas:
- Ahorro en la factura eléctrica
- Energía limpia y renovable
...
```

**Ventajas**:
- ✅ Archivos pequeños (solo texto)
- ✅ Fácil de procesar con herramientas de análisis de texto
- ✅ Ideal para búsquedas y análisis semántico

---

#### Opción B: Guardar HTML original
**Parámetro**: `save_html`
**Tipo**: Boolean
**Por defecto**: `true`

**Comportamiento**: Guarda el código HTML completo de la página en formato `.html`.

**Contenido guardado**: HTML con toda la estructura, estilos inline, scripts

**Ejemplo de archivo generado**:
```html
autoconsumo.html:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Autoconsumo Fotovoltaico</title>
    <style>...</style>
</head>
<body>
    <h1>Autoconsumo Fotovoltaico</h1>
    <p>El autoconsumo fotovoltaico permite...</p>
    ...
</body>
</html>
```

**Ventajas**:
- ✅ Preserva la estructura original
- ✅ Permite visualizar offline con formato
- ✅ Útil para análisis de estructura web

**Desventajas**:
- ⚠️ Archivos más grandes
- ⚠️ Puede contener código JavaScript/CSS no útil

**Combinaciones Recomendadas**:

| Uso | save_page_text | save_html |
|-----|----------------|-----------|
| Análisis de texto / NLP | ✅ | ❌ |
| Archivo completo offline | ✅ | ✅ |
| Análisis de estructura web | ❌ | ✅ |
| Máximo ahorro de espacio | ✅ | ❌ |

---

## 🎨 Ejemplos de Configuraciones Completas

### 📝 Ejemplo 1: Scraping Preciso (Investigación Académica)
```javascript
{
  max_depth: 2,
  crawl_strategy: 'stop',           // Solo ramas con términos
  file_types: ['documents'],         // Solo PDFs y documentos
  download_scope: 'same-domain',     // Solo archivos oficiales
  path_restriction: 'base-path',     // Solo sección específica
  save_page_text: true,              // Para análisis de texto
  save_html: false                   // No necesita HTML
}
```
**Resultado**: Scraping rápido, preciso, solo contenido relevante.

---

### 🌐 Ejemplo 2: Scraping Exhaustivo (Archivo Completo)
```javascript
{
  max_depth: 5,
  crawl_strategy: 'continue',        // Explorar todo
  file_types: ['documents', 'images', 'archives', 'other'],
  download_scope: 'any-domain',      // Todos los archivos
  path_restriction: 'same-domain',   // Todo el sitio
  save_page_text: true,
  save_html: true                    // Archivo completo
}
```
**Resultado**: Copia completa del sitio web con todos sus recursos.

---

### ⚡ Ejemplo 3: Scraping Rápido (Monitoreo Periódico)
```javascript
{
  max_depth: 1,
  crawl_strategy: 'stop',
  file_types: ['documents'],
  download_scope: 'same-domain',
  path_restriction: 'base-path',
  save_page_text: true,
  save_html: false
}
```
**Resultado**: Actualización rápida de contenido conocido.

---

### 🖼️ Ejemplo 4: Scraping de Multimedia
```javascript
{
  max_depth: 3,
  crawl_strategy: 'continue',
  file_types: ['images', 'archives'], // Solo multimedia
  download_scope: 'any-domain',       // Incluir CDNs
  path_restriction: 'base-path',
  save_page_text: false,               // No necesita texto
  save_html: false
}
```
**Resultado**: Descarga de imágenes y archivos comprimidos sin guardar texto.

---

## 🚀 Cómo Usar la Configuración

### Desde la Interfaz Web:

1. **Abrir Panel de Configuración**: Click en "⚙️ Configuración Avanzada"
2. **Ajustar Opciones**: Selecciona las opciones deseadas
3. **Aplicar**: Click en "✓ Aplicar Configuración"
4. **Iniciar Scraping**: Click en "Iniciar Scraping"

### Valores por Defecto:
Si no cambias ninguna opción, se usan estos valores:
```javascript
{
  max_depth: 3,
  crawl_strategy: 'continue',
  file_types: ['documents'],
  download_scope: 'same-domain',
  path_restriction: 'base-path',
  save_page_text: true,
  save_html: true
}
```

---

## 📊 Impacto en Rendimiento

| Configuración | Velocidad | Precisión | Volumen Datos |
|---------------|-----------|-----------|---------------|
| max_depth alto | 🐌 Lento | ⭐⭐⭐ Alto | 📦📦📦 Grande |
| crawl_strategy: continue | 🐌 Lento | ⭐⭐⭐ Alto | 📦📦 Mediano |
| file_types: all | 🐌 Lento | ⭐⭐ Medio | 📦📦📦 Grande |
| download_scope: any-domain | 🐢 Medio | ⭐⭐ Medio | 📦📦 Mediano |
| path_restriction: same-domain | 🐌 Lento | ⭐⭐⭐ Alto | 📦📦📦 Grande |

---

## ⚠️ Advertencias y Recomendaciones

1. **Respeta robots.txt**: La aplicación obedece las reglas de robots.txt automáticamente.

2. **Profundidad moderada**: No uses `max_depth > 5` a menos que sea absolutamente necesario.

3. **Combina inteligentemente**: `crawl_strategy: stop` + `path_restriction: base-path` = muy rápido y preciso.

4. **Monitorea espacio**: Activa `images` solo si tienes suficiente espacio de almacenamiento.

5. **Términos de interés precisos**: Define términos específicos para mejorar la precisión.

6. **Exclusiones**: Usa exclusiones para evitar secciones no deseadas (ej: "error", "404", "acceso denegado").

---

## 📞 Soporte

Si encuentras algún problema o necesitas ayuda, revisa los logs en tiempo real en la interfaz web.
