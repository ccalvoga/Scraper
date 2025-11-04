# 🚀 Inicio Rápido - Web Scraper

## ▶️ Iniciar la Aplicación

### Paso 1: Ejecutar Flask
```bash
python app.py
```

**Salida esperada**:
```
 * Serving Flask app 'app'
 * Debug mode: on
WARNING: This is a development server. Do not use it in a production deployment.
 * Running on http://127.0.0.1:5001
Press CTRL+C to quit
```

### Paso 2: Abrir Navegador
```
http://localhost:5001
```

---

## 🎯 Uso Básico (Primeros Pasos)

### 1. Verificar Archivos de Entrada

Asegúrate de que existan estos archivos:

**fuentes.csv** (URLs a scrapear):
```csv
descripcion;URL
ejemplo;https://www.miteco.gob.es/es/energia/renovables/regimen-economico-energias-renovables.html
```

**terminos_interes.txt** (Palabras clave):
```
autoconsumo
renovables
fotovoltaica
```

**exclusiones.txt** (Opcional - términos a evitar):
```
error
404
```

---

### 2. Iniciar Scraping Simple

**Opción A: Con configuración por defecto**
1. Click en **"Iniciar Scraping"**
2. Esperar a que termine
3. Ver resultados en panel de logs

**Opción B: Con configuración personalizada**
1. Click en **"⚙️ Configuración Avanzada"**
2. Ajustar opciones (profundidad, tipos de archivos, etc.)
3. Click en **"✓ Aplicar Configuración"**
4. Click en **"Iniciar Scraping"**

---

### 3. Monitorear Progreso

La interfaz muestra en tiempo real:
- **Logs** → Panel derecho (scroll automático)
- **Estado** → Mensaje junto a botones
- **Resultados** → Panel inferior (se actualiza cada 5 segundos)

---

### 4. Ver Resultados

Los archivos descargados están en:
```
ejecuciones/
  └── 2025-11-03_22-30-00/        ← Carpeta timestamped
      ├── autoconsumo_documents/   ← Archivos descargados
      │   ├── pagina1.html.txt     ← Texto extraído
      │   ├── pagina1.html         ← HTML original
      │   ├── documento.pdf        ← PDFs descargados
      │   └── ...
      ├── scraper.log              ← Log completo
      ├── scraper_config.json      ← Configuración usada
      ├── fuentes.csv              ← Copia de fuentes
      ├── terminos_interes.txt     ← Copia de términos
      └── exclusiones.txt          ← Copia de exclusiones
```

---

## ⚙️ Configuración Avanzada

### Opciones Disponibles

| Opción | Valores | Por Defecto |
|--------|---------|-------------|
| **Profundidad Máxima** | 0-10 | 3 |
| **Comportamiento sin términos** | Continuar / Detener | Continuar |
| **Tipos de archivos** | Documents / Images / Archives / Other | Documents |
| **Alcance de descargas** | Mismo dominio / Cualquier dominio | Mismo dominio |
| **Restricción de directorio** | Solo base path / Todo dominio | Solo base path |
| **Guardar texto** | Sí / No | Sí |
| **Guardar HTML** | Sí / No | Sí |

---

## ❓ Solución de Problemas

### Problema: Flask no inicia
```bash
# Verificar que el puerto 5001 esté libre
netstat -ano | findstr :5001

# Si está ocupado, cambiar puerto en app.py:
# app.run(debug=True, port=5002)
```

### Problema: No encuentra fuentes.csv
```bash
# Crear archivo de ejemplo
echo "ejemplo;https://www.example.com" > fuentes.csv
```

### Problema: Scraping no inicia
1. Ver logs en panel derecho
2. Verificar que `run_scraper.py` existe
3. Verificar que las URLs en `fuentes.csv` son válidas

### Problema: No se descargan archivos
1. Abrir **Configuración Avanzada**
2. Verificar que "Documentos" esté seleccionado
3. Aplicar configuración
4. Reiniciar scraping

---

## 📊 Ejemplos de Configuración

### Ejemplo 1: Scraping Rápido
```
Profundidad: 1
Comportamiento: Detener rama
Archivos: Solo documentos
Restricción: Solo base path
```
→ Ideal para actualización rápida de contenido conocido

### Ejemplo 2: Scraping Profundo
```
Profundidad: 5
Comportamiento: Continuar
Archivos: Todos los tipos
Restricción: Todo el dominio
```
→ Ideal para archivo completo de un sitio web

### Ejemplo 3: Solo Multimedia
```
Profundidad: 3
Comportamiento: Continuar
Archivos: Imágenes + Archivos comprimidos
Guardar texto: No
Guardar HTML: No
```
→ Ideal para descargar recursos multimedia

---

## 🔍 Ver Logs Detallados

### Durante el scraping:
- **UI Web**: Panel de logs en tiempo real
- **Archivo**: `ejecuciones/{timestamp}/scraper.log`

### Después del scraping:
```bash
# Ver últimas 50 líneas del log
powershell -Command "Get-Content 'ejecuciones\{timestamp}\scraper.log' -Tail 50"
```

---

## 🛑 Detener el Scraping

**Actualmente**:
1. Cerrar Flask (Ctrl+C en terminal)
2. El proceso de Scrapy terminará automáticamente

**Futuro** (implementación pendiente):
- Botón "Cancelar" en la UI

---

## 📁 Estructura de Directorios

```
04 WEB_Scraper/
├── app.py                      ← Flask (servidor web)
├── run_scraper.py              ← Scrapy (script de scraping)
├── config.py                   ← Configuración general
├── fuentes.csv                 ← URLs a scrapear
├── terminos_interes.txt        ← Palabras clave
├── exclusiones.txt             ← Términos a evitar
├── templates/
│   └── index.html              ← Interfaz web
├── static/
│   ├── style.css               ← Estilos
│   └── script.js               ← Lógica frontend
├── autoconsumo_scraper_scrapy/ ← Proyecto Scrapy
│   └── autoconsumo_scraper_scrapy/
│       ├── spiders/
│       │   └── generic_spider.py   ← Spider principal
│       ├── pipelines.py        ← Guardado de archivos
│       ├── items.py            ← Estructura de datos
│       └── settings.py         ← Config de Scrapy
└── ejecuciones/                ← Resultados (timestamped)
```

---

## 📚 Documentación Completa

- `CONFIGURACION_AVANZADA.md` - Explicación detallada de opciones (300+ líneas)
- `MEJORAS_MULTIDOMINIOS.md` - Soporte multi-dominio
- `FIX_STATUS_BREAKPOINT.md` - Arquitectura de procesos separados
- `FIX_THREADING_ERROR.md` - Evolución de la solución

---

## ✅ Checklist Antes de Scrapear

- [ ] Flask está corriendo (`python app.py`)
- [ ] `fuentes.csv` tiene URLs válidas
- [ ] `terminos_interes.txt` tiene palabras clave
- [ ] Configuración ajustada (si es necesario)
- [ ] Navegador abierto en `http://localhost:5001`

**¡Listo para scrapear!** 🚀

---

## 🆘 Ayuda

Si encuentras problemas:
1. Revisa los logs en la UI
2. Verifica `ejecuciones/{timestamp}/scraper.log`
3. Consulta la documentación en los archivos `.md`
4. Verifica que todos los archivos Python compilen sin errores

**Prueba rápida de sintaxis**:
```bash
python -m py_compile app.py
python -m py_compile run_scraper.py
```

Ambos deben ejecutarse sin errores.
