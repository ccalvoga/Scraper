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

    const logOutput = document.getElementById('log-output');
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
            if (logOutput) logOutput.textContent = 'Ficheros recargados y vistas limpiadas.';
            if (procesadosOutput) procesadosOutput.innerHTML = '<p>Esperando nueva ejecución...</p>';
            alert('Ficheros recargados y vistas limpiadas.');
        });
    }

    console.log('File handlers configurados');

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
                        cancelScrapeBtn.style.display = 'inline-block';
                        cancelScrapeBtn.disabled = true;
                        cancelScrapeBtn.textContent = 'Cancelar no soportado';
                    }
                    if (scrapeStatusSpan) {
                        scrapeStatusSpan.textContent = `Scrapeando ${data.current} de ${data.total} fuentes...`;
                    }
                } else {
                    startScrapeBtn.disabled = false;
                    startScrapeBtn.textContent = 'Iniciar Scraping';
                    if (cancelScrapeBtn) cancelScrapeBtn.style.display = 'none';
                    if (scrapeStatusSpan) scrapeStatusSpan.textContent = '';
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
            if (logOutput) logOutput.textContent = 'Iniciando scraping...';
            startScrapeBtn.disabled = true;
            startScrapeBtn.textContent = 'Scraping en progreso...';
            if (cancelScrapeBtn) cancelScrapeBtn.style.display = 'inline-block';
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
                if (data.content && logOutput) {
                    logOutput.textContent = data.content;
                    logOutput.scrollTop = logOutput.scrollHeight;
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('Error loading logs:', error);
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
        }, 5000);

        setInterval(() => {
            try {
                loadLogs();
            } catch (e) {
                console.error('Error en polling logs:', e);
            }
        }, 3000);
    }, 3000);

    console.log('✅ Aplicación inicializada correctamente');
});

console.log('Script cargado completamente');
