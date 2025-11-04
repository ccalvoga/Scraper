// Script.js con manejo seguro de errores y sin bloqueos
console.log('Script cargando...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado');

    // Referencias a elementos
    const editors = {
        'fuentes.csv': document.getElementById('fuentes-editor'),
        'exclusiones.txt': document.getElementById('exclusiones-editor'),
        'terminos_interes.txt': document.getElementById('terminos-editor'),
    };

    const logPanel = document.getElementById('log-panel');
    const logResizeHandle = document.getElementById('log-resize-handle');
    const logOutput = document.getElementById('log-output');
    const logFilterButtons = document.querySelectorAll('.log-filter-btn');
    const logClearBtn = document.getElementById('log-clear');
    const logRefreshBtn = document.getElementById('log-refresh');
    const logLastUpdated = document.getElementById('log-last-updated');
    const logEntryCount = document.getElementById('log-entry-count');
    const procesadosOutput = document.getElementById('procesados-output');
    const startScrapeBtn = document.getElementById('start-scrape');
    const cancelScrapeBtn = document.getElementById('cancel-scrape');
    const scrapeStatusSpan = document.getElementById('scrape-status');
    const reloadFilesBtn = document.getElementById('reload-files');
    const fuentesPreview = document.getElementById('fuentes-preview-container');
    const toggleConfigBtn = document.getElementById('toggle-config');
    const configPanel = document.getElementById('config-panel');
    const applyConfigBtn = document.getElementById('apply-config');

    let scrapeStatusInterval;
    let currentLogFilter = 'all';

    // Configuración del Scraper (valores por defecto)
    let scraperConfig = {
        max_depth: 3,
        crawl_strategy: 'continue',
        file_types: ['documents'],
        download_scope: 'same-domain',
        path_restriction: 'base-path',
        save_page_text: true,
        save_html: true
    };

    console.log('Variables inicializadas');

    const LOG_PANEL_WIDTH_KEY = 'logPanelWidth';
    const MIN_LOG_PANEL_WIDTH = 320;
    const MAX_LOG_PANEL_WIDTH = 900;

    const applyStoredLogWidth = () => {
        if (!logPanel) return;
        let storedWidth = null;
        try {
            storedWidth = localStorage.getItem(LOG_PANEL_WIDTH_KEY);
        } catch (error) {
            return;
        }
        if (!storedWidth) return;
        const parsed = parseInt(storedWidth, 10);
        if (Number.isFinite(parsed)) {
            const clamped = Math.max(MIN_LOG_PANEL_WIDTH, Math.min(MAX_LOG_PANEL_WIDTH, parsed));
            logPanel.style.width = `${clamped}px`;
        }
    };

    // --- Toggle Config Panel ---
    if (toggleConfigBtn && configPanel) {
        toggleConfigBtn.addEventListener('click', () => {
            if (configPanel.style.display === 'none') {
                configPanel.style.display = 'block';
                toggleConfigBtn.textContent = '▲ Ocultar Configuración';
            } else {
                configPanel.style.display = 'none';
                toggleConfigBtn.textContent = '⚙️ Configuración Avanzada';
            }
        });
        console.log('Toggle config configurado');
    }

    applyStoredLogWidth();

    // --- Apply Configuration ---
    if (applyConfigBtn) {
        applyConfigBtn.addEventListener('click', () => {
            scraperConfig.max_depth = parseInt(document.getElementById('max-depth').value);
            scraperConfig.crawl_strategy = document.querySelector('input[name="crawl-strategy"]:checked').value;
            scraperConfig.download_scope = document.querySelector('input[name="download-scope"]:checked').value;
            scraperConfig.path_restriction = document.querySelector('input[name="path-restriction"]:checked').value;
            scraperConfig.save_page_text = document.getElementById('save-page-text').checked;
            scraperConfig.save_html = document.getElementById('save-html').checked;

            const selectedFileTypes = [];
            document.querySelectorAll('input[name="file-type"]:checked').forEach(checkbox => {
                selectedFileTypes.push(checkbox.value);
            });
            scraperConfig.file_types = selectedFileTypes;

            alert('✓ Configuración aplicada correctamente');
            console.log('Configuración actualizada:', scraperConfig);
        });
        console.log('Apply config configurado');
    }

    // --- Lógica de Pestañas ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });

            if (targetId === 'fuentes-preview-container') {
                renderCsvAsTable(editors['fuentes.csv'].value);
            }
        });
    });
    console.log('Tabs configurados');

    const renderCsvAsTable = (csvContent) => {
        if (!fuentesPreview) return;

        const lines = csvContent.trim().split('\n');
        if (lines.length === 0) {
            fuentesPreview.innerHTML = '<p>No hay datos que mostrar.</p>';
            return;
        }

        let table = '<table class="csv-preview-table"><thead><tr>';
        const headers = lines[0].split(';');
        headers.forEach(header => {
            table += `<th>${header}</th>`;
        });
        table += '</tr></thead><tbody>';

        for (let i = 1; i < lines.length; i++) {
            table += '<tr>';
            const cells = lines[i].split(';');
            cells.forEach(cell => {
                if (cell.trim().startsWith('http')) {
                    table += `<td><a href="${cell.trim()}" target="_blank">${cell.trim()}</a></td>`;
                } else {
                    table += `<td>${cell}</td>`;
                }
            });
            table += '</tr>';
        }

        table += '</tbody></table>';
        fuentesPreview.innerHTML = table;
    };

    // --- Lógica de Ficheros (con timeout) ---
    const loadFiles = () => {
        console.log('Cargando archivos...');
        for (const filename in editors) {
            if (!editors[filename]) continue;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seg timeout

            fetch(`/api/files/${filename}`, { signal: controller.signal })
                .then(response => {
                    clearTimeout(timeoutId);
                    return response.json();
                })
                .then(data => {
                    if (data.content && editors[filename]) {
                        editors[filename].value = data.content;
                        if (filename === 'fuentes.csv') {
                            renderCsvAsTable(data.content);
                        }
                    }
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    console.error(`Error loading ${filename}:`, error);
                    if (editors[filename]) {
                        editors[filename].value = `# Error cargando archivo: ${error.message}`;
                    }
                });
        }
    };

    // Listener para actualizar vista previa
    if (editors['fuentes.csv']) {
        editors['fuentes.csv'].addEventListener('input', (e) => {
            renderCsvAsTable(e.target.value);
        });
    }

    const saveFile = (filename) => {
        const content = editors[filename].value;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch(`/api/files/${filename}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            return response.json();
        })
        .then(data => {
            if (data.success) {
                alert(`${filename} guardado correctamente.`);
            } else {
                alert(`Error al guardar ${filename}: ${data.error}`);
            }
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.error(`Error saving ${filename}:`, error);
            alert(`Error: ${error.message}`);
        });
    };

    document.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filename = btn.dataset.filename;
            if (filename) {
                saveFile(filename);
            }
        });
    });

    if (reloadFilesBtn) {
        reloadFilesBtn.addEventListener('click', () => {
            loadFiles();
            if (logOutput) {
                parsedLogEntries = [{
                    id: Date.now(),
                    line: 'Ficheros recargados y vistas limpiadas.',
                    severity: 'info'
                }];
                lastLogRawContent = '';
                updateLogDisplay(true);
            }
            if (procesadosOutput) procesadosOutput.innerHTML = '<p>Esperando nueva ejecución...</p>';
            alert('Ficheros recargados y vistas limpiadas.');
        });
    }

    console.log('File handlers configurados');

    if (cancelScrapeBtn) {
        cancelScrapeBtn.style.display = 'inline-block';
        cancelScrapeBtn.disabled = true;
        cancelScrapeBtn.textContent = 'Cancelar';
    }

    // --- Utilidades del panel de logs ---
    if (logResizeHandle && logPanel) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const getClientX = (event) => {
            if (event.touches && event.touches.length > 0) {
                return event.touches[0].clientX;
            }
            return event.clientX;
        };

        const handleResize = (event) => {
            if (!isResizing) return;
            event.preventDefault();
            const clientX = getClientX(event);
            const delta = startX - clientX;
            let newWidth = startWidth + delta;
            newWidth = Math.max(MIN_LOG_PANEL_WIDTH, Math.min(MAX_LOG_PANEL_WIDTH, newWidth));
            logPanel.style.width = `${Math.round(newWidth)}px`;
        };

        const stopResize = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchmove', handleResize);
            document.removeEventListener('touchend', stopResize);
            document.body.classList.remove('log-resizing');
            logPanel.classList.remove('resizing');
            const currentWidth = parseInt(window.getComputedStyle(logPanel).width, 10);
            if (Number.isFinite(currentWidth)) {
                const clamped = Math.max(MIN_LOG_PANEL_WIDTH, Math.min(MAX_LOG_PANEL_WIDTH, currentWidth));
                try {
                    localStorage.setItem(LOG_PANEL_WIDTH_KEY, String(clamped));
                } catch (error) {
                    // Ignore storage issues (private mode, quotas, etc.)
                }
            }
        };

        const startResize = (event) => {
            event.preventDefault();
            isResizing = true;
            startX = getClientX(event);
            startWidth = logPanel.offsetWidth;
            document.body.classList.add('log-resizing');
            logPanel.classList.add('resizing');
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            document.addEventListener('touchmove', handleResize, { passive: false });
            document.addEventListener('touchend', stopResize);
        };

        logResizeHandle.addEventListener('mousedown', startResize);
        logResizeHandle.addEventListener('touchstart', startResize, { passive: false });
    }

    const MAX_LOG_ENTRIES = 400;
    const LOG_SEPARATOR = ' \u00B7 ';
    let lastLogRawContent = '';
    let parsedLogEntries = [];

    const SOURCE_CLASS_MAP = {
        Scrapy: 'log-source--scrapy',
        Spider: 'log-source--spider',
        Pipeline: 'log-source--pipeline',
        Sistema: 'log-source--sistema',
        Downloader: 'log-source--downloader',
        Engine: 'log-source--engine',
        Extensions: 'log-source--engine'
    };

    const detectLogSeverity = (line) => {
        const upper = line.toUpperCase();
        if (upper.includes('ERROR')) return 'error';
        if (upper.includes('WARNING') || upper.includes('WARN')) return 'warning';
        if (upper.includes('DEBUG')) return 'debug';
        return 'info';
    };

    const normalizeLevel = (level) => (level || '').toUpperCase();

    const severityFromLevel = (level, fallbackLine) => {
        switch (level) {
            case 'ERROR':
                return 'error';
            case 'WARNING':
            case 'WARN':
                return 'warning';
            case 'DEBUG':
                return 'debug';
            case 'INFO':
                return 'info';
            default:
                return detectLogSeverity(fallbackLine);
        }
    };

    const getSourceClass = (source) => SOURCE_CLASS_MAP[source] || 'log-source--default';

    const formatLogMessage = (messageParts) => {
        if (!Array.isArray(messageParts) || messageParts.length === 0) {
            return '';
        }

        const [firstPart, ...restParts] = messageParts;
        const firstLower = firstPart.toLowerCase();

        if (firstLower.startsWith('términos encontrados en ')) {
            const url = firstPart.substring('Términos encontrados en '.length).trim();
            const terms = restParts.join(' | ').trim();
            if (terms) {
                return `Términos encontrados: ${terms} en ${url}`;
            }
            return `Términos encontrados en ${url}`;
        }

        if (firstLower.startsWith('exclusión en ')) {
            const url = firstPart.substring('Exclusión en '.length).trim();
            let detail = restParts.join(' | ').trim();

            if (!detail && restParts.length === 0 && messageParts.length > 1) {
                detail = messageParts[1].trim();
            }

            if (detail.toLowerCase().startsWith('término:')) {
                detail = detail.substring('término:'.length).trim();
            }

            if (detail) {
                return `Exclusión: ${detail} en ${url}`;
            }

            return `Exclusión en ${url}`;
        }

        return messageParts.join(' \u2013 ').trim();
    };

    const parseLogContent = (content) => {
        return content
            .split(/\r?\n/)
            .filter(line => line.trim().length > 0)
            .map((line, index) => {
                const parts = line
                    .split(LOG_SEPARATOR)
                    .map(part => part.trim())
                    .filter(part => part.length > 0);

                let time = '';
                let source = '';
                let level = '';
                let messageParts = [];

                if (parts.length >= 4) {
                    time = parts[0];
                    source = parts[1];
                    level = parts[2];
                    messageParts = parts.slice(3);
                } else if (parts.length === 3) {
                    time = parts[0];
                    source = parts[1];
                    messageParts = parts.slice(2);
                } else {
                    messageParts = [parts.join(' \u2013 ')];
                }

                const normalizedLevel = normalizeLevel(level);
                const severity = severityFromLevel(normalizedLevel, line);
                const formattedMessage = formatLogMessage(messageParts);
                const messageToUse = formattedMessage || messageParts.join(' \u2013 ').trim() || line;

                return {
                    id: index,
                    line,
                    severity,
                    time,
                    source,
                    level: normalizedLevel,
                    message: messageToUse,
                    sourceClass: getSourceClass(source)
                };
            });
    };

    const getFilteredLogEntries = () => {
        if (currentLogFilter === 'all') {
            return parsedLogEntries;
        }
        return parsedLogEntries.filter(entry => entry.severity === currentLogFilter);
    };

    const createSpan = (className, text) => {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        return span;
    };

    const updateLogDisplay = (forceScroll = false) => {
        if (!logOutput) return;

        const isScrolledToBottom = logOutput.scrollHeight - logOutput.clientHeight <= logOutput.scrollTop + 50;
        const filteredEntries = getFilteredLogEntries();

        let entriesToRender = filteredEntries;
        let truncated = false;
        if (entriesToRender.length > MAX_LOG_ENTRIES) {
            entriesToRender = entriesToRender.slice(entriesToRender.length - MAX_LOG_ENTRIES);
            truncated = true;
        }

        const fragment = document.createDocumentFragment();

        if (truncated) {
            const metaLine = document.createElement('div');
            metaLine.className = 'log-line log-line--meta';
            metaLine.textContent = `... mostrando últimas ${entriesToRender.length} de ${filteredEntries.length} entradas`;
            fragment.appendChild(metaLine);
        }

        entriesToRender.forEach(entry => {
            const severityClass = entry.severity || 'info';
            const lineElement = document.createElement('div');
            lineElement.className = `log-line log-line--${severityClass}`;

            if (entry.time) {
                lineElement.appendChild(createSpan('log-time', entry.time));
            }

            if (entry.source) {
                const sourceClasses = ['log-source'];
                if (entry.sourceClass) {
                    sourceClasses.push(entry.sourceClass);
                }
                lineElement.appendChild(createSpan(sourceClasses.join(' '), entry.source));
            }

            const messageText = entry.message || entry.line || '';
            lineElement.appendChild(createSpan('log-message', messageText));

            fragment.appendChild(lineElement);
        });

        logOutput.innerHTML = '';
        logOutput.appendChild(fragment);

        if (logEntryCount) {
            if (filteredEntries.length === entriesToRender.length) {
                logEntryCount.textContent = `Entradas: ${filteredEntries.length}`;
            } else {
                logEntryCount.textContent = `Entradas: ${filteredEntries.length} (mostrando ${entriesToRender.length})`;
            }
        }

        if ((forceScroll || isScrolledToBottom) && logOutput.scrollHeight > logOutput.clientHeight) {
            logOutput.scrollTop = logOutput.scrollHeight;
        }
    };

    if (logFilterButtons && logFilterButtons.length > 0) {
        logFilterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter || 'all';
                currentLogFilter = filter;
                logFilterButtons.forEach(control => control.classList.toggle('active', control === btn));
                updateLogDisplay();
            });
        });
    }

    if (logClearBtn) {
        logClearBtn.addEventListener('click', () => {
            parsedLogEntries = [];
            lastLogRawContent = '';
            updateLogDisplay();
            if (logLastUpdated) {
                logLastUpdated.textContent = 'Actualizado: --';
            }
        });
    }

    if (logRefreshBtn) {
        logRefreshBtn.addEventListener('click', () => {
            lastLogRawContent = '';
            loadLogs();
        });
    }

    // --- Lógica de Scraping y Logs ---
    const updateScrapeStatus = () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch('/api/scrape_status', { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                if (data.status === 'running') {
                    startScrapeBtn.disabled = true;
                    startScrapeBtn.textContent = 'Scraping en progreso...';
                    if (cancelScrapeBtn) {
                        cancelScrapeBtn.disabled = false;
                        cancelScrapeBtn.textContent = 'Cancelar Scraping';
                    }
                    if (scrapeStatusSpan) {
                        const runningMessage = data.message || `Scrapeando ${data.current} de ${data.total} fuentes...`;
                        scrapeStatusSpan.textContent = runningMessage;
                    }
                } else if (data.status === 'error') {
                    startScrapeBtn.disabled = false;
                    startScrapeBtn.textContent = 'Reintentar scraping';
                    if (cancelScrapeBtn) {
                        cancelScrapeBtn.disabled = true;
                        cancelScrapeBtn.textContent = 'Cancelar';
                    }
                    if (scrapeStatusSpan) {
                        scrapeStatusSpan.textContent = data.message || 'Scraping detenido con errores.';
                    }
                    if (scrapeStatusInterval) {
                        clearInterval(scrapeStatusInterval);
                        scrapeStatusInterval = null;
                    }
                } else {
                    startScrapeBtn.disabled = false;
                    startScrapeBtn.textContent = 'Iniciar Scraping';
                    if (cancelScrapeBtn) {
                        cancelScrapeBtn.disabled = true;
                        cancelScrapeBtn.textContent = 'Cancelar';
                    }
                    if (scrapeStatusSpan) scrapeStatusSpan.textContent = data.message || '';
                    if (scrapeStatusInterval) {
                        clearInterval(scrapeStatusInterval);
                        scrapeStatusInterval = null;
                    }
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Error fetching scrape status:', error);
            });
    };

    if (startScrapeBtn) {
        startScrapeBtn.addEventListener('click', () => {
            if (logOutput) {
                parsedLogEntries = [{
                    id: Date.now(),
                    line: 'Iniciando scraping...',
                    severity: 'info'
                }];
                lastLogRawContent = '';
                updateLogDisplay(true);
            }
            startScrapeBtn.disabled = true;
            startScrapeBtn.textContent = 'Scraping en progreso...';
            if (cancelScrapeBtn) {
                cancelScrapeBtn.disabled = false;
                cancelScrapeBtn.textContent = 'Cancelar Scraping';
            }
            if (scrapeStatusSpan) scrapeStatusSpan.textContent = 'Inicializando...';

            if (!scrapeStatusInterval) {
                scrapeStatusInterval = setInterval(updateScrapeStatus, 1000);
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scraperConfig),
                signal: controller.signal
            })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    startScrapeBtn.disabled = false;
                    startScrapeBtn.textContent = 'Iniciar Scraping';
                    if (cancelScrapeBtn) cancelScrapeBtn.style.display = 'none';
                    if (scrapeStatusSpan) scrapeStatusSpan.textContent = '';
                    if (scrapeStatusInterval) {
                        clearInterval(scrapeStatusInterval);
                        scrapeStatusInterval = null;
                    }
                } else {
                    alert(data.message);
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Error starting scrape:', error);
                alert('Error al iniciar el scraping: ' + error.message);
                startScrapeBtn.disabled = false;
                startScrapeBtn.textContent = 'Iniciar Scraping';
                if (cancelScrapeBtn) cancelScrapeBtn.style.display = 'none';
                if (scrapeStatusSpan) scrapeStatusSpan.textContent = '';
                if (scrapeStatusInterval) {
                    clearInterval(scrapeStatusInterval);
                    scrapeStatusInterval = null;
                }
            });
        });
    }

    if (cancelScrapeBtn) {
        cancelScrapeBtn.addEventListener('click', () => {
            if (!confirm('¿Estás seguro de que quieres cancelar el scraping?')) {
                return;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            fetch('/api/scrape/cancel', {
                method: 'POST',
                signal: controller.signal
            })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                if (data.message) {
                    alert(data.message);
                    cancelScrapeBtn.style.display = 'none';
                    startScrapeBtn.disabled = false;
                    startScrapeBtn.textContent = 'Iniciar Scraping';
                    if (scrapeStatusSpan) scrapeStatusSpan.textContent = '';
                    if (scrapeStatusInterval) {
                        clearInterval(scrapeStatusInterval);
                        scrapeStatusInterval = null;
                    }
                } else if (data.error) {
                    alert(data.error);
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Error cancelling scrape:', error);
                alert('Error al cancelar el scraping: ' + error.message);
            });
        });
    }

    const loadProcesados = () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch('/api/procesados', { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                if (data.content && procesadosOutput) {
                    procesadosOutput.innerHTML = marked.parse(data.content);
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Error loading procesados:', error);
            });
    };

    const loadLogs = () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch('/api/logs', { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                if (typeof data.content === 'string' && logOutput) {
                    if (data.content !== lastLogRawContent) {
                        lastLogRawContent = data.content;
                        parsedLogEntries = parseLogContent(data.content);
                        if (logLastUpdated) {
                            const now = new Date();
                            logLastUpdated.textContent = `Actualizado: ${now.toLocaleTimeString()}`;
                        }
                        updateLogDisplay(true);
                    }
                } else if (!data.content && logOutput) {
                    parsedLogEntries = [];
                    lastLogRawContent = '';
                    logOutput.innerHTML = '';
                    if (logEntryCount) {
                        logEntryCount.textContent = 'Entradas: 0';
                    }
                    if (logLastUpdated) {
                        logLastUpdated.textContent = 'Actualizado: --';
                    }
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Error loading logs:', error);
                if (logLastUpdated) {
                    logLastUpdated.textContent = 'Actualizado: error de carga';
                }
            });
    };

    console.log('Scraping handlers configurados');

    // --- Carga Inicial (con retraso para evitar bloqueos) ---
    console.log('Iniciando carga diferida...');
    setTimeout(() => {
        try {
            loadFiles();
        } catch (e) {
            console.error('Error en loadFiles:', e);
        }
    }, 500);

    setTimeout(() => {
        try {
            loadProcesados();
        } catch (e) {
            console.error('Error en loadProcesados:', e);
        }
    }, 1000);

    setTimeout(() => {
        try {
            loadLogs();
        } catch (e) {
            console.error('Error en loadLogs:', e);
        }
    }, 1500);

    setTimeout(() => {
        try {
            updateScrapeStatus();
        } catch (e) {
            console.error('Error en updateScrapeStatus:', e);
        }
    }, 2000);

    // Polling (empieza después de 3 segundos)
    setTimeout(() => {
        setInterval(() => {
            try {
                loadProcesados();
            } catch (e) {
                console.error('Error en polling procesados:', e);
            }
        }, 10000); // Reducido de 5s a 10s

        setInterval(() => {
            try {
                loadLogs();
            } catch (e) {
                console.error('Error en polling logs:', e);
            }
        }, 5000); // Aumentado de 3s a 5s para reducir carga
    }, 3000);

    console.log('✅ Aplicación inicializada correctamente');
});

console.log('Script cargado completamente');
