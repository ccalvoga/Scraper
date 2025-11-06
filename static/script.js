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
    const logGroupToggleBtn = document.getElementById('log-group-toggle');
    const procesadosOutput = document.getElementById('procesados-output');
    const startScrapeBtn = document.getElementById('start-scrape');
    const cancelScrapeBtn = document.getElementById('cancel-scrape');
    const scrapeStatusSpan = document.getElementById('scrape-status');
    const reloadFilesBtn = document.getElementById('reload-files');
    const fuentesPreview = document.getElementById('fuentes-preview-container');
    const toggleConfigBtn = document.getElementById('toggle-config');
    const configPanel = document.getElementById('config-panel');
    const applyConfigBtn = document.getElementById('apply-config');
    const executionSelector = document.getElementById('execution-selector');
    const saveButtons = document.querySelectorAll('.save-btn');
    const dedupeFuentesBtn = document.getElementById('dedupe-fuentes');
    const dedupeFeedback = document.getElementById('dedupe-feedback');
    const filterStartInput = document.getElementById('filter-start-date');
    const filterEndInput = document.getElementById('filter-end-date');

    let scrapeStatusInterval;
    let currentLogFilter = 'all';
    let currentHighlightedUrl = null;
    let currentExecutionId = null;
    let executionsList = [];
    let logsIntervalId = null;
    let procesadosIntervalId = null;
    let pollingStartTimeout = null;
    let logGroupMode = 'chronological';
    const processedUrlBuckets = {
        markdown: new Set(),
        logs: new Set()
    };
    const processedUrlSet = new Set();
    const sourceMetaByIndex = new Map();

    const isHistoricalMode = () => currentExecutionId !== null;

    const buildApiUrl = (url) => {
        if (isHistoricalMode()) {
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}execution=${encodeURIComponent(currentExecutionId)}`;
        }
        return url;
    };

    const findExecutionMeta = (executionId) => executionsList.find(exec => exec.id === executionId);

    const formatExecutionLabel = (executionId) => {
        if (!executionId) return '';
        const meta = findExecutionMeta(executionId);
        if (meta && meta.label) {
            return meta.label;
        }
        return executionId;
    };

    const setElementHidden = (element, hidden) => {
        if (!element) return;
        element.classList.toggle('hidden', hidden);
    };

    const setEditorsReadOnly = (readOnly) => {
        Object.values(editors).forEach(editor => {
            if (!editor) return;
            editor.readOnly = readOnly;
            editor.classList.toggle('editor-readonly', readOnly);
        });
    };

    let liveInitialTimeouts = [];

    const clearLiveInitialTimeouts = () => {
        liveInitialTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        liveInitialTimeouts = [];
    };

    const clearDataPollingIntervals = () => {
        if (pollingStartTimeout) {
            clearTimeout(pollingStartTimeout);
            pollingStartTimeout = null;
        }
        if (logsIntervalId) {
            clearInterval(logsIntervalId);
            logsIntervalId = null;
        }
        if (procesadosIntervalId) {
            clearInterval(procesadosIntervalId);
            procesadosIntervalId = null;
        }
    };

    const stopAllIntervals = () => {
        clearLiveInitialTimeouts();
        clearDataPollingIntervals();
        if (scrapeStatusInterval) {
            clearInterval(scrapeStatusInterval);
            scrapeStatusInterval = null;
        }
    };

    const startPolling = () => {
        clearDataPollingIntervals();
        if (isHistoricalMode()) {
            return;
        }
        logsIntervalId = setInterval(() => {
            if (!isHistoricalMode()) {
                try {
                    loadLogs();
                } catch (e) {
                    console.error('Error en polling logs:', e);
                }
            }
        }, 5000);
        procesadosIntervalId = setInterval(() => {
            if (!isHistoricalMode()) {
                try {
                    loadProcesados();
                } catch (e) {
                    console.error('Error en polling procesados:', e);
                }
            }
        }, 10000);
    };

    const applyModeToUi = (historical) => {
        setElementHidden(startScrapeBtn, historical);
        setElementHidden(cancelScrapeBtn, historical);
        setElementHidden(toggleConfigBtn, historical);
        if (configPanel) {
            configPanel.classList.toggle('hidden', historical);
            if (historical) {
                configPanel.style.display = 'none';
            }
        }
        saveButtons.forEach(btn => setElementHidden(btn, historical));
        setEditorsReadOnly(historical);
        if (dedupeFuentesBtn) {
            const container = dedupeFuentesBtn.parentElement || dedupeFuentesBtn;
            setElementHidden(container, historical);
            dedupeFuentesBtn.disabled = historical;
        }
        if (dedupeFeedback && historical) {
            dedupeFeedback.textContent = '';
        }
        if (reloadFilesBtn) {
            reloadFilesBtn.textContent = historical ? 'Volver a ficheros actuales' : 'Recargar Ficheros';
        }
        if (scrapeStatusSpan) {
            if (historical) {
                scrapeStatusSpan.textContent = `Visualizando ejecución ${formatExecutionLabel(currentExecutionId)}`;
            } else {
                scrapeStatusSpan.textContent = '';
            }
        }
        if (!historical && toggleConfigBtn) {
            toggleConfigBtn.classList.remove('hidden');
            toggleConfigBtn.textContent = '⚙️ Configuración Avanzada';
        }
        if (filterStartInput) {
            filterStartInput.disabled = historical;
        }
        if (filterEndInput) {
            filterEndInput.disabled = historical;
        }
    };

    const switchToHistorical = (executionId) => {
        if (!executionId) return;
        if (executionId === currentExecutionId) return;
        if (executionSelector && executionSelector.value !== executionId) {
            executionSelector.value = executionId;
        }
        currentExecutionId = executionId;
        stopAllIntervals();
        applyModeToUi(true);
        activateTab('fuentes-preview-container');
        resetProcessedUrlTracking();
        lastLogRawContent = '';
        loadFiles();
        loadProcesados();
        loadLogs();
        highlightSourceByUrl(null);
    };

    const scheduleLiveDataLoads = () => {
        clearLiveInitialTimeouts();
        console.log('Iniciando carga diferida...');
        const addTimeout = (callback, delay) => {
            const id = setTimeout(() => {
                liveInitialTimeouts = liveInitialTimeouts.filter(item => item !== id);
                callback();
            }, delay);
            liveInitialTimeouts.push(id);
        };
        addTimeout(() => { if (!isHistoricalMode()) loadFiles(); }, 500);
        addTimeout(() => { if (!isHistoricalMode()) loadProcesados(); }, 1000);
        addTimeout(() => { if (!isHistoricalMode()) loadLogs(); }, 1500);
        addTimeout(() => { if (!isHistoricalMode()) updateScrapeStatus(); }, 2000);
    };

    const switchToLiveMode = () => {
        if (executionSelector) {
            executionSelector.value = '__live';
        }
        currentExecutionId = null;
        stopAllIntervals();
        applyModeToUi(false);
        highlightSourceByUrl(null);
        resetProcessedUrlTracking();
        lastLogRawContent = '';
        scheduleLiveDataLoads();
        pollingStartTimeout = setTimeout(() => {
            startPolling();
        }, 3000);
    };

    const renderExecutionOptions = () => {
        if (!executionSelector) return;
        const previousValue = isHistoricalMode() ? currentExecutionId : '__live';
        executionSelector.innerHTML = '';
        const liveOption = document.createElement('option');
        liveOption.value = '__live';
        liveOption.textContent = 'Ejecución actual';
        executionSelector.appendChild(liveOption);

        executionsList.forEach(exec => {
            const option = document.createElement('option');
            option.value = exec.id;
            option.textContent = exec.label || exec.id;
            executionSelector.appendChild(option);
        });

        if (previousValue && previousValue !== '__live') {
            const exists = executionsList.some(exec => exec.id === previousValue);
            executionSelector.value = exists ? previousValue : '__live';
            if (!exists) {
                currentExecutionId = null;
            }
        } else {
            executionSelector.value = '__live';
        }
    };

    const fetchExecutionsList = () => {
        return fetch('/api/executions')
            .then(response => response.json())
            .then(data => {
                executionsList = Array.isArray(data.executions) ? data.executions : [];
                renderExecutionOptions();
            })
            .catch(error => {
                console.error('Error al cargar la lista de ejecuciones:', error);
            });
    };

    // Configuración del Scraper (valores por defecto)
    let scraperConfig = {
        max_depth: 3,
        crawl_strategy: 'continue',
        file_types: ['documents'],
        download_scope: 'same-domain',
        path_restriction: 'base-path',
        save_page_text: true,
        save_html: true,
        start_date: null,
        end_date: null
    };

    console.log('Variables inicializadas');

    if (filterStartInput) {
        filterStartInput.value = scraperConfig.start_date || '';
    }
    if (filterEndInput) {
        filterEndInput.value = scraperConfig.end_date || '';
    }

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
            scraperConfig.start_date = filterStartInput && filterStartInput.value ? filterStartInput.value : null;
            scraperConfig.end_date = filterEndInput && filterEndInput.value ? filterEndInput.value : null;

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

    const activateTab = (targetId) => {
        if (!targetId) return;
        tabButtons.forEach(btn => {
            const isActive = btn.dataset.tab === targetId;
            btn.classList.toggle('active', isActive);
        });
        tabContents.forEach(content => {
            const isMatch = content.id === targetId;
            content.classList.toggle('active', isMatch);
        });
        if (targetId === 'fuentes-preview-container' && editors['fuentes.csv']) {
            renderSourcesPreview(editors['fuentes.csv'].value);
        }
    };

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.tab;
            activateTab(targetId);
        });
    });
    console.log('Tabs configurados');

    if (executionSelector) {
        executionSelector.addEventListener('change', (event) => {
            const selectedValue = event.target.value;
            if (selectedValue && selectedValue !== '__live') {
                switchToHistorical(selectedValue);
            } else {
                switchToLiveMode();
            }
        });
    }

    const escapeHtml = (value) => {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const normalizeUrl = (value) => {
        if (value === null || value === undefined) {
            return null;
        }
        const trimmed = String(value).trim();
        if (!trimmed) {
            return null;
        }
        try {
            const normalizedUrl = new URL(trimmed);
            normalizedUrl.hash = '';
            let href = normalizedUrl.href;
            if (href.endsWith('/')) {
                href = href.replace(/\/+$/, '');
            }
            return href;
        } catch (error) {
            return trimmed.replace(/\/+$/, '');
        }
    };

    const updateProcessedSourceCards = () => {
        if (!fuentesPreview) return;
        const cards = fuentesPreview.querySelectorAll('.source-card');
        cards.forEach(card => {
            const normalizedCardUrl = normalizeUrl(card.dataset.url);
            if (normalizedCardUrl && processedUrlSet.has(normalizedCardUrl)) {
                card.classList.add('source-card--processed');
            } else {
                card.classList.remove('source-card--processed');
            }
        });
    };

    const recomputeProcessedUrlSet = () => {
        processedUrlSet.clear();
        processedUrlBuckets.markdown.forEach(url => processedUrlSet.add(url));
        processedUrlBuckets.logs.forEach(url => processedUrlSet.add(url));
    };

    const resetProcessedUrlTracking = () => {
        processedUrlBuckets.markdown.clear();
        processedUrlBuckets.logs.clear();
        processedUrlSet.clear();
        updateProcessedSourceCards();
    };

    const refreshProcessedUrlsFromMarkdown = (rawMarkdown = '') => {
        processedUrlBuckets.markdown.clear();
        if (typeof rawMarkdown === 'string' && rawMarkdown.trim()) {
            const urlRegex = /https?:\/\/[^\s<>"'`]+/gi;
            let match;
            while ((match = urlRegex.exec(rawMarkdown)) !== null) {
                const normalized = normalizeUrl(match[0]);
                if (normalized) {
                    processedUrlBuckets.markdown.add(normalized);
                }
            }
        }
        recomputeProcessedUrlSet();
        updateProcessedSourceCards();
    };

    const refreshProcessedUrlsFromLogs = () => {
        processedUrlBuckets.logs.clear();
        const urlRegex = /https?:\/\/[^\s<>"'`]+/gi;

        parsedLogEntries.forEach(entry => {
            if (!entry) return;
            if (!SOURCES_WITH_URL_INDEX.has(entry.source)) return;
            if (entry.severity === 'error') return;
            const suspects = [];
            if (typeof entry.line === 'string') {
                suspects.push(entry.line);
            }
            if (typeof entry.message === 'string' && entry.message !== entry.line) {
                suspects.push(entry.message);
            }
            suspects.forEach(text => {
                let match;
                const localRegex = new RegExp(urlRegex.source, urlRegex.flags);
                while ((match = localRegex.exec(text)) !== null) {
                    const normalized = normalizeUrl(match[0]);
                    if (normalized) {
                        processedUrlBuckets.logs.add(normalized);
                    }
                }
            });
        });

        recomputeProcessedUrlSet();
        updateProcessedSourceCards();
    };

    const highlightSourceByUrl = (targetUrl) => {
        if (!fuentesPreview) return;
        const normalizedUrl = normalizeUrl(targetUrl);
        const cards = fuentesPreview.querySelectorAll('.source-card');
        let newlyActivated = null;

        cards.forEach(card => {
            const cardUrl = normalizeUrl(card.dataset.url);
            const isMatch = normalizedUrl && cardUrl === normalizedUrl;
            const wasActive = card.classList.contains('active');
            if (isMatch) {
                card.classList.add('active');
                if (!wasActive) {
                    newlyActivated = card;
                }
            } else {
                card.classList.remove('active');
            }
        });

        if (newlyActivated) {
            newlyActivated.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        currentHighlightedUrl = normalizedUrl || null;
    };

    const renderSourcesPreview = (csvContent) => {
        if (!fuentesPreview) return;

        const trimmed = (csvContent || '').trim();
        sourceMetaByIndex.clear();
        if (!trimmed) {
            fuentesPreview.innerHTML = '<p class="sources-preview__empty">No hay datos que mostrar.</p>';
            highlightSourceByUrl(null);
            return;
        }

        const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
        const entries = [];

        lines.forEach(line => {
            const cells = line.split(';');
            if (cells.length < 2) {
                return;
            }
            const description = (cells[0] || '').trim();
            const urlCandidate = (cells[1] || '').trim();
            if (!/^https?:\/\//i.test(urlCandidate)) {
                return;
            }
            const extra = cells.slice(2).map(chunk => (chunk ? chunk.trim() : '')).filter(Boolean);
            entries.push({
                description,
                url: urlCandidate,
                extra
            });
        });

        if (entries.length === 0) {
            fuentesPreview.innerHTML = '<p class="sources-preview__empty">No hay datos que mostrar.</p>';
            highlightSourceByUrl(null);
            return;
        }

        let markup = '<div class="sources-preview">';
        entries.forEach((entry, idx) => {
            const indexValue = idx + 1;
            sourceMetaByIndex.set(indexValue, {
                description: entry.description,
                url: entry.url
            });
            const extrasMarkup = entry.extra.length
                ? `<ul class="source-card__meta">${entry.extra.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
                : '';
            markup += `
                <article class="source-card" data-url="${escapeHtml(entry.url)}" data-index="${indexValue}">
                    <div class="source-card__header">
                        <span class="source-card__index">#${indexValue}</span>
                        <span class="source-card__description">${escapeHtml(entry.description || '(Sin descripción)')}</span>
                    </div>
                    <div class="source-card__footer">
                        <a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener">${escapeHtml(entry.url)}</a>
                    </div>
                    ${extrasMarkup}
                </article>
            `;
        });
        markup += '</div>';

        fuentesPreview.innerHTML = markup;
        updateProcessedSourceCards();
        highlightSourceByUrl(currentHighlightedUrl);
    };

    // --- Lógica de Ficheros (con timeout) ---
    const loadFiles = () => {
        console.log('Cargando archivos...');
        for (const filename in editors) {
            if (!editors[filename]) continue;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seg timeout

            fetch(buildApiUrl(`/api/files/${filename}`), { signal: controller.signal })
                .then(response => {
                    clearTimeout(timeoutId);
                    return response.json();
                })
                .then(data => {
                    if (data.content && editors[filename]) {
                        editors[filename].value = data.content;
                        if (filename === 'fuentes.csv') {
                            renderSourcesPreview(data.content);
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
            renderSourcesPreview(e.target.value);
        });
    }

    const saveFile = (filename) => {
        if (isHistoricalMode()) {
            alert('No se pueden guardar cambios mientras se visualiza una ejecución archivada.');
            return;
        }
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

    const dedupeFuentes = () => {
        if (isHistoricalMode()) {
            alert('No se pueden modificar ejecuciones archivadas.');
            return;
        }
        const editor = editors['fuentes.csv'];
        if (!editor) return;

        const originalContent = editor.value;
        if (!originalContent.trim()) {
            if (dedupeFeedback) {
                dedupeFeedback.textContent = 'No hay datos que limpiar.';
                setTimeout(() => dedupeFeedback.textContent = '', 3000);
            }
            return;
        }

        const lines = originalContent.split(/\r?\n/);
        const seen = new Set();
        let duplicates = 0;
        const cleanedLines = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                cleanedLines.push(line);
                return;
            }
            const cells = trimmed.split(';');
            if (cells.length < 2) {
                cleanedLines.push(line);
                return;
            }
            const url = cells[1].trim();
            if (!url) {
                cleanedLines.push(line);
                return;
            }
            if (seen.has(url)) {
                duplicates += 1;
                return;
            }
            seen.add(url);
            cleanedLines.push(line);
        });

        editor.value = cleanedLines.join('\n');
        renderSourcesPreview(editor.value);
        if (dedupeFeedback) {
            if (duplicates === 0) {
                dedupeFeedback.textContent = 'No se encontraron duplicados.';
            } else if (duplicates === 1) {
                dedupeFeedback.textContent = '1 URL duplicada eliminada.';
            } else {
                dedupeFeedback.textContent = `${duplicates} URLs duplicadas eliminadas.`;
            }
            setTimeout(() => {
                if (dedupeFeedback.textContent) {
                    dedupeFeedback.textContent = '';
                }
            }, 3000);
        }
    };

    if (dedupeFuentesBtn) {
        dedupeFuentesBtn.addEventListener('click', () => {
            dedupeFuentes();
        });
    }

    if (reloadFilesBtn) {
        reloadFilesBtn.addEventListener('click', () => {
            if (isHistoricalMode()) {
                switchToLiveMode();
                fetchExecutionsList();
                return;
            }
            loadFiles();
            if (logOutput) {
                parsedLogEntries = [{
                    id: Date.now(),
                    line: 'Ficheros recargados y vistas limpiadas.',
                    severity: 'info'
                }];
                lastLogRawContent = '';
                updateLogDisplay(true);
                refreshProcessedUrlsFromLogs();
            }
            if (procesadosOutput) procesadosOutput.innerHTML = '<p>Esperando nueva ejecución...</p>';
            resetProcessedUrlTracking();
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
        Download: 'log-source--downloader',
        Downloader: 'log-source--downloader',
        Engine: 'log-source--engine',
        Extensions: 'log-source--engine'
    };
    const SOURCES_WITH_URL_INDEX = new Set(['Scrapy', 'Spider', 'Download', 'Downloader', 'Pipeline', 'Engine']);

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
        let lastUrlIndex = null;
        const LEVEL_TOKENS = new Set(['ERROR', 'WARNING', 'WARN', 'DEBUG']);

        return content
            .split(/\r?\n/)
            .filter(line => line.trim().length > 0)
            .map((line, index) => {
                const rawParts = line
                    .split(LOG_SEPARATOR)
                    .map(part => part.trim())
                    .filter(part => part.length > 0);

                if (rawParts.length === 0) {
                    return {
                        id: index,
                        line,
                        severity: 'info',
                        time: '',
                        source: '',
                        level: '',
                        message: line,
                        sourceClass: getSourceClass(''),
                        urlIndex: null
                    };
                }

                let time = rawParts.shift() || '';
                let source = rawParts.shift() || '';
                let level = '';
                let urlIndex = null;

                if (rawParts.length) {
                    const candidateLevel = normalizeLevel(rawParts[0]);
                    if (candidateLevel && LEVEL_TOKENS.has(candidateLevel)) {
                        level = candidateLevel;
                        rawParts.shift();
                    }
                }

                if (rawParts.length && /^#\d+$/.test(rawParts[0])) {
                    const candidateIndex = Number(rawParts[0].slice(1));
                    if (Number.isFinite(candidateIndex)) {
                        urlIndex = candidateIndex;
                        lastUrlIndex = candidateIndex;
                    }
                    rawParts.shift();
                }

                const messageParts = rawParts.length > 0 ? rawParts : [line];

                const progressMatch = line.match(/Progreso\s+(\d+)\s*\/\s*(\d+)/i);
                if (progressMatch) {
                    const progressIndex = Number(progressMatch[1]);
                    if (Number.isFinite(progressIndex)) {
                        lastUrlIndex = progressIndex;
                        if (urlIndex === null) {
                            urlIndex = progressIndex;
                        }
                    }
                }

                if (urlIndex === null && SOURCES_WITH_URL_INDEX.has(source) && Number.isFinite(lastUrlIndex)) {
                    urlIndex = lastUrlIndex;
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
                    sourceClass: getSourceClass(source),
                    urlIndex
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

    const describeLogGroup = (index) => {
        if (!Number.isFinite(index) || index <= 0) {
            return 'General';
        }
        const meta = sourceMetaByIndex.get(index);
        const baseLabel = `Fuente #${index}`;
        if (!meta) {
            return baseLabel;
        }
        let cleanedDescription = (meta.description || '').trim();
        const normalized = cleanedDescription.toLowerCase().replace(/\s+/g, '');
        if (!cleanedDescription || normalized === '(sindescripcion)' || normalized === '(sindescripci\u00f3n)') {
            cleanedDescription = '';
        }
        if (cleanedDescription) {
            return `${baseLabel} — ${cleanedDescription}`;
        }
        return meta.url ? `${baseLabel} — ${meta.url}` : baseLabel;
    };

    const createLogLineElement = (entry) => {
        const severityClass = entry.severity || 'info';
        const lineElement = document.createElement('div');
        lineElement.className = `log-line log-line--${severityClass}`;

        if (entry.time) {
            lineElement.appendChild(createSpan('log-time', entry.time));
        }

        if (Number.isFinite(entry.urlIndex)) {
            lineElement.appendChild(createSpan('log-url-index', `#${entry.urlIndex}`));
        }

        let sourceSpan = null;
        if (entry.source) {
            const sourceClasses = ['log-source'];
            if (entry.sourceClass) {
                sourceClasses.push(entry.sourceClass);
            }
            sourceSpan = createSpan(sourceClasses.join(' '), entry.source);
            lineElement.appendChild(sourceSpan);
        }

        const messageText = entry.message || entry.line || '';
        const messageSpan = createSpan('log-message', messageText);
        if (messageText.includes('Descarga omitida por fecha') || messageText.includes('Fuera de rango')) {
            messageSpan.classList.add('log-message--range-warning');
        }
        if (sourceSpan && entry.source === 'Download' && messageText.includes('Descarga programada')) {
            sourceSpan.classList.add('log-source--planned');
        }
        lineElement.appendChild(messageSpan);
        return lineElement;
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
            metaLine.textContent = `... mostrando ultimas ${entriesToRender.length} de ${filteredEntries.length} entradas`;
            fragment.appendChild(metaLine);
        }

        if (logGroupMode === 'grouped') {
            const grouped = new Map();
            entriesToRender.forEach(entry => {
                const key = Number.isFinite(entry.urlIndex) ? entry.urlIndex : 0;
                if (!grouped.has(key)) {
                    grouped.set(key, []);
                }
                grouped.get(key).push(entry);
            });

            const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
                if (a === 0) return -1;
                if (b === 0) return 1;
                return a - b;
            });

            sortedKeys.forEach(key => {
                const groupEntries = grouped.get(key);
                const groupElement = document.createElement('div');
                groupElement.className = 'log-group';

                const header = document.createElement('div');
                header.className = 'log-group__header';
                header.appendChild(createSpan('log-group__title', describeLogGroup(key)));
                header.appendChild(createSpan('log-group__count', `${groupEntries.length} entradas`));

                const body = document.createElement('div');
                body.className = 'log-group__body';
                groupEntries.forEach(entry => body.appendChild(createLogLineElement(entry)));

                groupElement.appendChild(header);
                groupElement.appendChild(body);
                fragment.appendChild(groupElement);
            });
        } else {
            entriesToRender.forEach(entry => {
                fragment.appendChild(createLogLineElement(entry));
            });
        }

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

    if (logGroupToggleBtn) {
        logGroupToggleBtn.addEventListener('click', () => {
            logGroupMode = logGroupMode === 'chronological' ? 'grouped' : 'chronological';
            logGroupToggleBtn.classList.toggle('active', logGroupMode === 'grouped');
            logGroupToggleBtn.textContent = logGroupMode === 'grouped'
                ? 'Ver en orden cronologico'
                : 'Agrupar por fuente';
            updateLogDisplay(true);
        });
    }

    if (logClearBtn) {
        logClearBtn.addEventListener('click', () => {
            parsedLogEntries = [];
            lastLogRawContent = '';
            updateLogDisplay();
            refreshProcessedUrlsFromLogs();
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
        if (isHistoricalMode()) {
            if (scrapeStatusSpan) {
                scrapeStatusSpan.textContent = `Visualizando ejecución ${formatExecutionLabel(currentExecutionId)}`;
            }
            return;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch(buildApiUrl('/api/scrape_status'), { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                let highlightTarget = null;

                if (data.status === 'running') {
                    if (startScrapeBtn) {
                        startScrapeBtn.disabled = true;
                        startScrapeBtn.textContent = 'Scraping en progreso...';
                    }
                    if (cancelScrapeBtn) {
                        cancelScrapeBtn.disabled = false;
                        cancelScrapeBtn.textContent = 'Cancelar Scraping';
                    }
                    if (scrapeStatusSpan) {
                        const totalRaw = Number(data.total);
                        const currentRaw = Number(data.current);
                        const total = Number.isFinite(totalRaw) ? totalRaw : 0;
                        const current = Number.isFinite(currentRaw) ? currentRaw : 0;
                        const parts = [];
                        if (total) {
                            parts.push(`Procesando ${current}/${total}`);
                        }
                        const descriptor = data.current_description || data.current_url;
                        if (descriptor) {
                            parts.push(descriptor);
                        }
                        const runningMessage = data.message || (parts.length ? parts.join(' · ') : 'Scraping en progreso...');
                        scrapeStatusSpan.textContent = runningMessage;
                    }
                    highlightTarget = data.current_url || null;
                } else if (data.status === 'error') {
                    if (startScrapeBtn) {
                        startScrapeBtn.disabled = false;
                        startScrapeBtn.textContent = 'Reintentar scraping';
                    }
                    if (cancelScrapeBtn) {
                        cancelScrapeBtn.disabled = true;
                        cancelScrapeBtn.textContent = 'Cancelar';
                    }
                    if (scrapeStatusSpan) {
                        scrapeStatusSpan.textContent = data.message || 'Scraping detenido con errores.';
                    }
                    highlightTarget = null;
                    if (scrapeStatusInterval) {
                        clearInterval(scrapeStatusInterval);
                        scrapeStatusInterval = null;
                    }
                } else {
                    if (startScrapeBtn) {
                        startScrapeBtn.disabled = false;
                        startScrapeBtn.textContent = 'Iniciar Scraping';
                    }
                    if (cancelScrapeBtn) {
                        cancelScrapeBtn.disabled = true;
                        cancelScrapeBtn.textContent = 'Cancelar';
                    }
                    if (scrapeStatusSpan) {
                        scrapeStatusSpan.textContent = data.message || '';
                    }
                    highlightTarget = null;
                    if (scrapeStatusInterval) {
                        clearInterval(scrapeStatusInterval);
                        scrapeStatusInterval = null;
                    }
                }

                highlightSourceByUrl(highlightTarget);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Error fetching scrape status:', error);
            });
    };

    if (startScrapeBtn) {
        startScrapeBtn.addEventListener('click', () => {
            if (isHistoricalMode()) {
                alert('Estás visualizando una ejecución archivada. Vuelve a los ficheros actuales para iniciar un nuevo scraping.');
                return;
            }
            activateTab('fuentes-preview-container');
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
            highlightSourceByUrl(null);

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
            if (isHistoricalMode()) {
                return;
            }
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
                    highlightSourceByUrl(null);
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

        fetch(buildApiUrl('/api/procesados'), { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                if (procesadosOutput) {
                    if (data.content) {
                        procesadosOutput.innerHTML = marked.parse(data.content);
                        refreshProcessedUrlsFromMarkdown(data.content);
                    } else {
                        procesadosOutput.innerHTML = '';
                        refreshProcessedUrlsFromMarkdown('');
                    }
                } else if (data.content) {
                    refreshProcessedUrlsFromMarkdown(data.content);
                } else {
                    refreshProcessedUrlsFromMarkdown('');
                }
                if (!isHistoricalMode()) {
                    fetchExecutionsList();
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

        fetch(buildApiUrl('/api/logs'), { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                if (typeof data.content === 'string' && logOutput) {
                    if (data.content !== lastLogRawContent) {
                        lastLogRawContent = data.content;
                        parsedLogEntries = parseLogContent(data.content);
                        refreshProcessedUrlsFromLogs();
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
                    refreshProcessedUrlsFromLogs();
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

    fetchExecutionsList()
        .finally(() => {
            switchToLiveMode();
        });

    console.log('✅ Aplicación inicializada correctamente');
});

console.log('Script cargado completamente');
