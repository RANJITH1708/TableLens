(() => {
    if (window.hasSupbyteContentScript) return;
    window.hasSupbyteContentScript = true;

    // --- STATE MANAGEMENT ---
    let pageTables = [];
    let lastRightClickedTable = null;
    let currentEditState = {};
    let activeChart = null;
    let domObserver = null;

    // --- HELPER: "Smart" Header Detection ---
    const _isHeaderRow = (row) => {
        if (!row) return false;
        const headerCells = row.querySelectorAll('th');
        const totalCells = row.children.length;
        return totalCells > 0 && headerCells.length > totalCells / 2;
    };

    // --- EVENT LISTENERS ---
    document.addEventListener('contextmenu', (e) => {
        const tableSelectors = 'table, [role="table"], [role="grid"], div';
        lastRightClickedTable = e.target.closest(tableSelectors);
    }, true);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const actions = {
            ping: () => Promise.resolve({ success: true }),
            showUI: (data) => {
                findAllTables();
                startObserver();
                const results = {
                    tables: pageTables.map((t, index) => ({
                        index, rows: t.rows?.length || t.children?.length || 0,
                        cols: t.rows?.[0]?.cells?.length || t.children?.[0]?.children?.length || 0
                    })),
                    selectedIndex: data?.selectedIndex ?? (pageTables.indexOf(lastRightClickedTable) > -1 ? pageTables.indexOf(lastRightClickedTable) : 0)
                };
                chrome.runtime.sendMessage({ action: 'tablesReady', data: results });

                if (data?.view) {
                    setTimeout(() => chrome.runtime.sendMessage({ action: 'changeView', view: data.view }), 50);
                }
                return Promise.resolve({ success: true });
            },
            getTableFingerprint: () => {
                const table = document.querySelector('.supbyte-table-highlight');
                if (!table) return Promise.resolve(null);
                const rows = table.querySelectorAll('tr, [role="row"]');
                let textContent = '';
                for (let i = 0; i < Math.min(rows.length, 2); i++) {
                    const cells = rows[i].children;
                    for (let j = 0; j < Math.min(cells.length, 5); j++) {
                        textContent += cells[j].innerText.trim().slice(0, 20);
                    }
                }
                const fingerprint = `rows:${rows.length}|cols:${rows[0]?.children.length || 0}|content:${textContent}`;
                return Promise.resolve(fingerprint);
            },
            findTableByFingerprint: (fingerprint) => {
                findAllTables();
                for (let i = 0; i < pageTables.length; i++) {
                    const table = pageTables[i];
                    const rows = table.querySelectorAll('tr, [role="row"]');
                    let currentTextContent = '';
                    for (let r = 0; r < Math.min(rows.length, 2); r++) {
                        const cells = rows[r].children;
                        for (let c = 0; c < Math.min(cells.length, 5); c++) {
                            currentTextContent += cells[c].innerText.trim().slice(0, 20);
                        }
                    }
                    const currentFingerprint = `rows:${rows.length}|cols:${rows[0]?.children.length || 0}|content:${currentTextContent}`;
                    if (currentFingerprint === fingerprint) {
                        return Promise.resolve({ success: true, newIndex: i });
                    }
                }
                const oldContent = fingerprint.substring(fingerprint.indexOf('|content:') + 9);
                if(oldContent){
                    for (let i = 0; i < pageTables.length; i++) {
                        const table = pageTables[i];
                        const rows = table.querySelectorAll('tr, [role="row"]');
                        let currentTextContent = '';
                        for (let r = 0; r < Math.min(rows.length, 2); r++) {
                            const cells = rows[r].children;
                            for (let c = 0; c < Math.min(cells.length, 5); c++) {
                                currentTextContent += cells[c].innerText.trim().slice(0, 20);
                            }
                        }
                        if(currentTextContent === oldContent) {
                            return Promise.resolve({ success: true, newIndex: i });
                        }
                    }
                }
                return Promise.resolve({ success: false });
            },
            highlightTable: () => highlightTable(request.tableIndex, request.filenamePattern),
            getTableData: () => Promise.resolve(getTableData(request.tableIndex, true)),
            getChartData: () => Promise.resolve(getTableData(request.tableIndex, false)),
            getTableHTML: () => {
                const table = pageTables[request.tableIndex];
                return Promise.resolve(table ? table.outerHTML : '');
            },
            copyTableToClipboard: () => Promise.resolve(Papa.unparse(request.data)),
            getTableEditState: () => {
                const stateToSend = { ...currentEditState, visibleColumns: Array.from(currentEditState.visibleColumns), excludedRows: Array.from(currentEditState.excludedRows) };
                return Promise.resolve(stateToSend);
            },
            updateTableEditState: (newState) => {
                if (newState.visibleColumns) newState.visibleColumns = new Set(newState.visibleColumns);
                if (newState.excludedRows) newState.excludedRows = new Set(newState.excludedRows);
                currentEditState = { ...currentEditState, ...newState };
                _applyStateToPage();
                return Promise.resolve({ success: true });
            },
            renderChartOnPage: (chartConfig) => {
                renderChartOnPage(chartConfig);
                return Promise.resolve({ success: true });
            },
            togglePageEditMode: ({ isEditing }) => {
                togglePageEditMode(isEditing);
                return Promise.resolve({ success: true });
            }
        };
        const action = actions[request.action];
        if (action) {
            Promise.resolve(action(request.data ?? request))
                .then(sendResponse)
                .catch(err => {
                    console.error(`Supbyte Error in content script action '${request.action}':`, err);
                    sendResponse({ success: false, error: err.message });
                });
            return true;
        }
    });

    window.addEventListener('cleanupSupbyte', cleanup);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && document.getElementById('supbyte-ui-iframe')) {
            activatePageListeners();
        }
    });
    
    function _applyStateToPage() {
        const table = document.querySelector('.supbyte-table-highlight');
        if (!table) return;
        
        applyLiveSort(table);
        applyLiveFilter(table);
        applyColumnVisibility(table);
        drawRowCheckboxes(table);
    }

    function resetEditState(table) {
        const columnData = [];
        const rows = Array.from(table.querySelectorAll('tr, [role="row"]'));
        if (!rows.length) return;

        const headerCells = Array.from(rows[0].children);
        headerCells.forEach((cell, index) => {
            columnData.push({ originalIndex: index, name: cell.innerText.trim() || `Column ${index + 1}` });
        });

        currentEditState = {
            columns: columnData,
            columnOrder: headerCells.map((_, i) => i),
            visibleColumns: new Set(headerCells.map((_, i) => i)),
            sortState: { columnIndex: null, direction: 'none' },
            excludedRows: new Set(),
            filters: {}
        };
    }

    function applyLiveSort(table) {
        const { columnIndex, direction } = currentEditState.sortState;
        if (columnIndex === null || direction === 'none' || !table) return;
        
        const parent = table.querySelector('tbody') || table;
        let rows = Array.from(parent.children);
        let headerRow = null;

        if (_isHeaderRow(rows[0])) {
            headerRow = rows.shift();
        }
        
        rows.sort((a, b) => {
            const aText = a.children[columnIndex]?.innerText || '';
            const bText = b.children[columnIndex]?.innerText || '';
            const comparison = aText.localeCompare(bText, undefined, { numeric: true });
            return direction === 'asc' ? comparison : -comparison;
        });

        if (headerRow) {
            rows.unshift(headerRow);
        }

        rows.forEach(row => parent.appendChild(row));
    }

    function applyLiveFilter(table) {
        const parent = table.querySelector('tbody') || table;
        const rows = Array.from(parent.children);
        const filters = currentEditState.filters || {};
        const activeFilters = Object.entries(filters).filter(([, value]) => value);

        if (activeFilters.length === 0) {
            rows.forEach(row => row.classList.remove('supbyte-row-filtered-out'));
            return;
        }

        rows.forEach(row => {
            if (_isHeaderRow(row)) return;

            let isVisible = true;
            for (const [colIndex, filterValue] of activeFilters) {
                const cell = row.children[colIndex];
                const cellText = cell ? cell.innerText.toLowerCase() : '';
                if (!cellText.includes(filterValue.toLowerCase())) {
                    isVisible = false;
                    break;
                }
            }
            row.classList.toggle('supbyte-row-filtered-out', !isVisible);
        });
    }

    function togglePageEditMode(isEditing) {
        const table = document.querySelector('.supbyte-table-highlight');
        if (!table) return;
        const cells = table.querySelectorAll('th, td, [role="cell"], [role="gridcell"]');
        
        cells.forEach(cell => {
            cell.setAttribute('contenteditable', isEditing);
        });

        if (isEditing) _applyStateToPage();
        else document.querySelectorAll('.supbyte-row-checkbox').forEach(el => el.remove());
    }

    function drawRowCheckboxes(table) {
        document.querySelectorAll('.supbyte-row-checkbox').forEach(el => el.remove());
        const rows = Array.from(table.querySelectorAll('tr, [role="row"]'));
        rows.forEach((row) => {
            if (_isHeaderRow(row)) return;
            const rowRect = row.getBoundingClientRect();
            const checkbox = document.createElement('input');
            const originalIdx = originalRowIndex(row);

            checkbox.type = 'checkbox';
            checkbox.className = 'supbyte-row-checkbox';
            checkbox.checked = !currentEditState.excludedRows.has(originalIdx);
            checkbox.style.top = `${window.scrollY + rowRect.top + (rowRect.height / 2) - 8}px`;
            checkbox.style.left = `${window.scrollX + rowRect.left - 25}px`;
            
            checkbox.onchange = () => {
                if (checkbox.checked) {
                    currentEditState.excludedRows.delete(originalIdx);
                } else {
                    currentEditState.excludedRows.add(originalIdx);
                }
                row.classList.toggle('supbyte-row-excluded', !checkbox.checked);
            };
            document.body.appendChild(checkbox);
        });
        
        rows.forEach(row => {
            row.classList.toggle('supbyte-row-excluded', currentEditState.excludedRows.has(originalRowIndex(row)));
        });
    }

    function originalRowIndex(rowEl) {
         const table = pageTables.find(t => t.contains(rowEl));
         if (!table) return -1;
         const allOriginalRows = Array.from(table.querySelectorAll('tr, [role="row"]'));
         return allOriginalRows.indexOf(rowEl);
    }

    function getTableData(index, withStyle) {
        const targetTable = pageTables[index];
        if (!targetTable) return null;
    
        let data = [];
        let tempRows = Array.from(targetTable.querySelectorAll('tr, [role="row"]'));
        let headerRow = null;

        if (_isHeaderRow(tempRows[0])) {
            headerRow = tempRows.shift();
        }
    
        const { columnIndex, direction } = currentEditState.sortState;
        if (columnIndex !== null && direction !== 'none') {
            tempRows.sort((a, b) => {
                const aText = a.children[columnIndex]?.innerText || '';
                const bText = b.children[columnIndex]?.innerText || '';
                const comparison = aText.localeCompare(bText, undefined, { numeric: true });
                return direction === 'asc' ? comparison : -comparison;
            });
        }
        
        const filters = currentEditState.filters || {};
        const activeFilters = Object.entries(filters).filter(([, value]) => value);
        if (activeFilters.length > 0) {
            tempRows = tempRows.filter(row => {
                for (const [colIndex, filterValue] of activeFilters) {
                    const cell = row.children[colIndex];
                    const cellText = cell ? cell.innerText.toLowerCase() : '';
                    if (!cellText.includes(filterValue.toLowerCase())) {
                        return false;
                    }
                }
                return true;
            });
        }

        if (headerRow) {
            tempRows.unshift(headerRow);
        }
    
        tempRows.forEach((row) => {
            const originalIdx = originalRowIndex(row);
            if (currentEditState.excludedRows.has(originalIdx)) {
                return;
            }
    
            const rowData = [];
            const allCells = Array.from(row.children);
    
            currentEditState.columnOrder.forEach(originalCellIndex => {
                if (currentEditState.visibleColumns.has(originalCellIndex)) {
                    const cell = allCells[originalCellIndex];
                    if (cell) {
                        rowData.push({
                            text: cell.innerText.trim(),
                            style: {}
                        });
                    }
                }
            });
            if (rowData.length > 0) data.push(rowData);
        });
    
        return withStyle ? data : data.map(row => row.map(cell => cell.text));
    }
    
    function startObserver() {
        if (domObserver) domObserver.disconnect();
        domObserver = new MutationObserver(() => {
            activatePageListeners();
            const newTableCount = scanForTables().length;
            if (newTableCount !== pageTables.length) {
                pageTables = scanForTables();
                const updatedData = {
                    tables: pageTables.map((t, index) => ({ index, rows: t.rows?.length || 0, cols: t.rows?.[0]?.cells?.length || 0 }))
                };
                chrome.runtime.sendMessage({ action: 'tablesUpdated', data: updatedData });
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
    }
    function scanForTables() {
        const findElementsRecursive = (selector, rootNode) => {
            let elements = Array.from(rootNode.querySelectorAll(selector));
            rootNode.querySelectorAll('*').forEach(node => {
                if (node.shadowRoot) elements = elements.concat(findElementsRecursive(selector, node.shadowRoot));
            });
            return elements;
        };
        const selectors = 'table, [role="table"], [role="grid"]';
        let potentialTables = findElementsRecursive(selectors, document);
        const findDivTables = () => {
             const candidates = new Map();
                findElementsRecursive('div[class], div[id]', document).forEach(el => {
                    if (el.children.length < 3 || el.offsetParent === null) return;
                    let firstChildSignature = null, consistent = true;
                    for (const child of el.children) {
                        if (child.children.length === 0) { consistent = false; break; }
                        const signature = `${child.children.length}:${Array.from(child.children).map(c => c.tagName).join(',')}`;
                        if (!firstChildSignature) firstChildSignature = signature;
                        else if (signature !== firstChildSignature) { consistent = false; break; }
                    }
                    if (consistent) candidates.set(el, el.children.length);
                });
                return Array.from(candidates.keys());
        };
        potentialTables = potentialTables.concat(findDivTables());
        return [...new Set(potentialTables)]
            .filter(t => t.offsetParent !== null && (t.rows?.length || t.children?.length) > 1 && t.getBoundingClientRect().width > 50)
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    }
    function findAllTables() { pageTables = scanForTables(); activatePageListeners(); }
    const handlePageClick = (e) => {
        if (e.target.closest('[contenteditable="true"], #supbyte-editor-toolbar, #supbyte-ui-iframe, #supbyte-chart-modal, .supbyte-row-checkbox')) return;
        const allCurrentTables = scanForTables();
        const clickedTableElement = e.target.closest('table, [role="table"], [role="grid"], div');
        if (!clickedTableElement || clickedTableElement.classList.contains('supbyte-table-highlight')) return;
        const newIndex = allCurrentTables.indexOf(clickedTableElement);
        if (newIndex > -1) {
            e.preventDefault();
            e.stopPropagation();
            pageTables = allCurrentTables;
            chrome.runtime.sendMessage({ action: 'tableClickedOnPage', data: { newIndex: newIndex }});
        }
    };
    function activatePageListeners() { document.removeEventListener('click', handlePageClick, true); document.addEventListener('click', handlePageClick, true); }
    async function highlightTable(index, filenamePattern) {
        const targetTable = pageTables[index];
        if (!targetTable) return;
        resetEditState(targetTable);
        cleanupDOM();
        if (!document.getElementById('supbyte-styler')) {
            const style = document.createElement('style');
            style.id = 'supbyte-styler';
            style.textContent = `
                .supbyte-table-highlight { outline: 3px dashed #1a73e8 !important; outline-offset: 4px; box-shadow: 0 0 20px rgba(26, 115, 232, .7); scroll-margin-top: 100px; cursor: pointer; }
                #supbyte-editor-toolbar { position: absolute; background: #fff; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 2147483645; padding: 6px; display: flex; gap: 6px; }
                #supbyte-editor-toolbar button { background: #f0f0f0; border: 1px solid #ccc; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-family: sans-serif; font-size: 13px; display: flex; align-items: center; gap: 4px; }
                #supbyte-editor-toolbar button:hover { background: #e0e0e0; }
                #supbyte-chart-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2147483646; }
                #supbyte-chart-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.3); z-index: 2147483647; width: 80vw; height: 80vh; max-width: 900px; display: flex; flex-direction: column; }
                #supbyte-chart-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-shrink: 0; }
                #supbyte-chart-modal-header h4 { margin: 0; font-family: sans-serif; font-size: 1.2em; flex-grow: 1; }
                #supbyte-chart-modal-header button { font-size: 1em; background: #eee; border: 1px solid #ccc; cursor: pointer; padding: 5px 10px; border-radius: 5px; }
                #supbyte-chart-modal-header button.close { font-size: 1.5em; background: none; border: none; padding: 0 5px; color: #555; }
                #supbyte-chart-canvas-container { position: relative; flex-grow: 1; }
                .supbyte-row-checkbox { position: absolute; z-index: 2147483644; }
                .supbyte-row-excluded { opacity: 0.4; background-color: #f2dede !important; }
                .supbyte-row-filtered-out { display: none !important; }
                .supbyte-column-hidden { filter: blur(3px); opacity: 0.6; pointer-events: none; transition: all 0.2s ease-in-out; }
            `;
            document.head.appendChild(style);
        }
        targetTable.classList.add('supbyte-table-highlight');
        targetTable.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const toolbar = document.createElement('div');
        toolbar.id = 'supbyte-editor-toolbar';
        const tblRect = targetTable.getBoundingClientRect();
        toolbar.style.top = `${window.scrollY + tblRect.top - 45}px`;
        toolbar.style.left = `${window.scrollX + tblRect.left}px`;
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit Table';
        editBtn.onclick = () => chrome.runtime.sendMessage({ action: 'openViewInUI', view: 'edit' });
        const chartBtn = document.createElement('button');
        chartBtn.innerHTML = '📊 Generate Chart';
        chartBtn.onclick = () => chrome.runtime.sendMessage({ action: 'openViewInUI', view: 'chart' });
        toolbar.appendChild(editBtn);
        toolbar.appendChild(chartBtn);
        document.body.appendChild(toolbar);
        return getTableTitle(filenamePattern);
    }

    function renderChartOnPage(config) {
        cleanupChartModal();
        const backdrop = document.createElement('div');
        backdrop.id = 'supbyte-chart-modal-backdrop';
        const modal = document.createElement('div');
        modal.id = 'supbyte-chart-modal';
        modal.innerHTML = `
            <div id="supbyte-chart-modal-header">
                <h4>Chart Visualization</h4>
                <button id="supbyte-chart-download-btn">Download</button>
                <button id="supbyte-chart-close-btn" class="close" title="Close">&times;</button>
            </div>
            <div id="supbyte-chart-canvas-container">
                <canvas id="supbyte-chart-canvas"></canvas>
            </div>
        `;
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        
        const ctx = document.getElementById('supbyte-chart-canvas').getContext('2d');
        if (activeChart) { activeChart.destroy(); }

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: !!config.title,
                    text: config.title,
                    font: { size: 18 },
                    padding: { top: 10, bottom: 20 }
                }
            },
            scales: { y: { beginAtZero: true } }
        };

        if (config.type === 'scatter') {
            chartOptions.scales = {
                x: { type: 'linear', position: 'bottom' },
                y: { beginAtZero: true }
            };
        } else if (config.type === 'pie') {
            delete chartOptions.scales;
        }

        activeChart = new Chart(ctx, {
            type: config.type,
            data: {
                labels: config.labels,
                datasets: config.datasets
            },
            options: chartOptions
        });

        backdrop.onclick = cleanupChartModal;
        document.getElementById('supbyte-chart-close-btn').onclick = cleanupChartModal;
        document.getElementById('supbyte-chart-download-btn').onclick = () => {
            const link = document.createElement('a');
            link.href = activeChart.toBase64Image('image/png', 1.0);
            link.download = `${(config.title || getTableTitle()).replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')}-chart.png`;
            link.click();
        };
    }

    function applyColumnVisibility(table) {
        if (!table || !currentEditState.columns) return;
        const rows = table.querySelectorAll('tr, [role="row"]');
        rows.forEach(row => {
            Array.from(row.children).forEach((cell, cellIndex) => {
                const correspondingHeader = currentEditState.columns.find(col => cellIndex === col.originalIndex);
                if (correspondingHeader) {
                    const isVisible = currentEditState.visibleColumns.has(correspondingHeader.originalIndex);
                    cell.classList.toggle('supbyte-column-hidden', !isVisible);
                }
            });
        });
    }
    function getTableTitle(pattern) {
        const title = document.title.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
        if (typeof pattern !== 'string') return title || 'export';
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const time = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        let filename = pattern.replace(/\[pageTitle\]/g, title).replace(/\[date\]/g, date).replace(/\[time\]/g, time);
        return filename || 'export';
    }
    function cleanupChartModal() { document.querySelectorAll('#supbyte-chart-modal-backdrop, #supbyte-chart-modal').forEach(el => el.remove()); if (activeChart) { activeChart.destroy(); activeChart = null; } }
    function cleanupDOM() { togglePageEditMode(false); document.querySelector('.supbyte-table-highlight')?.classList.remove('supbyte-table-highlight'); document.querySelector('#supbyte-editor-toolbar')?.remove(); cleanupChartModal(); }
    function cleanup() { document.removeEventListener('click', handlePageClick, true); document.getElementById('supbyte-styler')?.remove(); if (domObserver) domObserver.disconnect(); cleanupDOM(); }
})();