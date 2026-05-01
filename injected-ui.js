// --- Element References ---
const filenameInput = document.getElementById('filename');
const formatSelect = document.getElementById('format');
const exportButton = document.getElementById('export-button');
const copyButton = document.getElementById('copy-button');
const copyStyledButton = document.getElementById('copy-styled-button');
const statusFeedback = document.getElementById('status-feedback');
const prevTableBtn = document.getElementById('prev-table-btn');
const nextTableBtn = document.getElementById('next-table-btn');
const tableIndicator = document.getElementById('table-indicator');
const closeBtn = document.getElementById('close-btn');
const dragHeader = document.getElementById('drag-header');
const settingsToggle = document.getElementById('settings-toggle');
const advancedOptionsDiv = document.getElementById('advanced-options');
const mainView = document.getElementById('main-view');
const editView = document.getElementById('edit-view');
const chartView = document.getElementById('chart-view');
const mainHeader = document.getElementById('main-header-title');
const viewHeader = document.getElementById('view-header-title');
const viewTitle = document.getElementById('view-title');
const backBtn = document.getElementById('back-to-main-btn');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const dialog = document.getElementById('supbyte-exporter-dialog');
const columnList = document.getElementById('column-list');
const reloadButton = document.getElementById('reload-button');
// Chart View Elements
const chartTypeSelect = document.getElementById('chart-type');
const chartTitleInput = document.getElementById('chart-title');
const generateChartBtn = document.getElementById('generate-chart-btn');
// Chart Config Groups
const configBarLine = document.getElementById('config-bar-line');
const configPie = document.getElementById('config-pie');
const configScatter = document.getElementById('config-scatter');
// Bar/Line Elements
const labelColumnBarLine = document.getElementById('label-column-bar-line');
const dataSeriesContainer = document.getElementById('data-series-container');
const addSeriesBtn = document.getElementById('add-series-btn');
// Pie Elements
const labelColumnPie = document.getElementById('label-column-pie');
const dataColumnPie = document.getElementById('data-column-pie');
// Scatter Elements
const dataColumnXScatter = document.getElementById('data-column-x-scatter');
const dataColumnYScatter = document.getElementById('data-column-y-scatter');


// --- State Management ---
let tablesOnPage = [];
let currentTableIndex = -1;
let currentTabId = null;
let statusTimeout;
let currentEditState = {};
let currentView = 'main';

// --- Centralized sendMessage function ---
async function sendMessage(message) {
    try {
        if (chrome.runtime?.id) {
            return await chrome.runtime.sendMessage(message);
        }
    } catch (e) {
        if (e.message.includes("Extension context invalidated") || e.message.includes("Receiving end does not exist")) {
            console.log("TableLens: Connection to extension was lost. This is expected on reload.");
            document.body.innerHTML = `<div class="error-view" style="padding: 20px; text-align: center;">Connection to the extension was lost. Please close and reopen this window.</div>`;
        } else {
            console.error("TableLens sendMessage error:", e);
        }
    }
    return undefined;
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initializeUi);
closeBtn.addEventListener('click', () => sendMessage({ action: 'closeInjectedUI' }));
prevTableBtn.addEventListener('click', () => navigateTables(-1));
nextTableBtn.addEventListener('click', () => navigateTables(1));
exportButton.addEventListener('click', handleExport);
copyButton.addEventListener('click', handleCopy);
copyStyledButton.addEventListener('click', handleStyledCopy);
reloadButton.addEventListener('click', handleReload);
formatSelect.addEventListener('change', () => {
    toggleAdvancedOptions();
    sendMessage({ action: 'setStorage', data: { defaultFormat: formatSelect.value } });
});
settingsToggle.addEventListener('click', () => {
    settingsToggle.classList.toggle('open');
    advancedOptionsDiv.classList.toggle('open');
});
dragHeader.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    sendMessage({ action: 'initiateDrag', offsetX: e.offsetX, offsetY: e.offsetY });
});
backBtn.addEventListener('click', () => switchView('main'));
darkModeToggle.addEventListener('click', toggleDarkMode);

// --- Core Functions ---
async function initializeUi() {
    const settings = await sendMessage({ action: 'getStorage', keys: ['defaultFormat', 'supbyteDarkMode'] });
    if (settings) {
        formatSelect.value = settings.defaultFormat || 'xlsx';

        // MODIFICATION: Default to dark mode if the setting is not explicitly false.
        const isDarkMode = settings.supbyteDarkMode !== false;

        if (isDarkMode) {
            dialog.classList.add('dark-theme');
            updateDarkModeIcon(true);
        }
    }
    toggleAdvancedOptions();

    const resultData = await sendMessage({ action: 'getFoundTables' });
    if (resultData?.tables?.length > 0) {
        tablesOnPage = resultData.tables;
        currentTableIndex = resultData.selectedIndex;
        currentTabId = resultData.tabId;
        await updateTableSelection();
    } else {
        updateUIForNoTables();
    }
}

function toggleDarkMode() {
    const isDark = dialog.classList.toggle('dark-theme');
    updateDarkModeIcon(isDark);
    sendMessage({ action: 'setStorage', data: { supbyteDarkMode: isDark } });
}

function updateDarkModeIcon(isDark) {
    const icon = darkModeToggle.querySelector('i');
    icon.className = isDark ? 'bx bx-sun' : 'bx bx-moon';
}

async function navigateTables(direction) {
    if (tablesOnPage.length === 0) return;
    currentTableIndex = (currentTableIndex + direction + tablesOnPage.length) % tablesOnPage.length;
    await updateTableSelection();
    if(mainView.style.display === 'none') {
        await populateView(currentView);
    }
}

async function updateTableSelection() {
    tableIndicator.textContent = `Table ${currentTableIndex + 1} of ${tablesOnPage.length}`;
    const hasTables = tablesOnPage.length > 0;
    prevTableBtn.disabled = !hasTables;
    nextTableBtn.disabled = !hasTables;
    exportButton.disabled = !hasTables;
    copyButton.disabled = !hasTables;
    copyStyledButton.disabled = !hasTables;
    const title = await sendMessage({ action: 'highlightTableInPage', tableIndex: currentTableIndex });
    if (title) filenameInput.value = title;
}

function handleExport() {
    if (currentTableIndex === -1) return;
    exportButton.classList.add('loading');
    showFeedback('Generating file, please wait...', 'in-progress');
    sendMessage({
        action: 'exportTable', tableIndex: currentTableIndex, format: formatSelect.value, filename: filenameInput.value || 'export',
        options: {
            delimiter: document.getElementById('delimiter')?.value || ',',
            pdfOrientation: document.getElementById('pdf-orientation')?.value || 'portrait',
            sheetName: document.getElementById('sheet-name')?.value || 'Sheet1',
            pdfTheme: document.getElementById('pdf-theme')?.value || 'grid',
            pdfFontSize: document.getElementById('pdf-font-size')?.value || '10',
            jsonFormat: document.getElementById('json-format')?.value || 'objects'
        }
    });
}

async function handleCopy() {
    if (currentTableIndex === -1) return;
    copyButton.classList.add('loading');
    showFeedback('Copying...', 'in-progress');
    const result = await sendMessage({ action: 'copyTable', tableIndex: currentTableIndex });
    copyButton.classList.remove('loading');
    if (result && result.success) {
        showFeedback('Copied to clipboard!', 'success');
    } else {
        showFeedback('Copy failed!', 'error');
    }
}

async function handleStyledCopy() {
    if (currentTableIndex === -1) return;
    copyStyledButton.classList.add('loading');
    showFeedback('Copying styled table...', 'in-progress');
    const result = await sendMessage({ action: 'copyTableStyled', tableIndex: currentTableIndex });
    copyStyledButton.classList.remove('loading');
    if (result && result.success) {
        showFeedback('Styled table copied!', 'success');
    } else {
        showFeedback('Styled copy failed!', 'error');
    }
}

function handleReload() {
    if (confirm("Are you sure? This will reload the page and discard all your live edits to the table.")) {
        showFeedback('Reloading page...', 'in-progress');
        sendMessage({ action: 'reloadAndReopen', view: 'edit' });
    }
}

async function switchView(viewName) {
    if (currentView === 'edit' && viewName !== 'edit') {
        sendMessage({ action: 'exitPageEditMode', tabId: currentTabId });
    }
    if (viewName === 'edit') {
        sendMessage({ action: 'enterPageEditMode', tabId: currentTabId });
    }
    currentView = viewName;

    mainView.style.display = 'none';
    editView.style.display = 'none';
    chartView.style.display = 'none';
    if (viewName === 'main') {
        mainHeader.style.display = 'flex';
        viewHeader.style.display = 'none';
        mainView.style.display = 'block';
    } else {
        mainHeader.style.display = 'none';
        viewHeader.style.display = 'flex';
        if (viewName === 'edit') {
            viewTitle.textContent = 'Edit Table';
            editView.style.display = 'block';
        } else if (viewName === 'chart') {
            viewTitle.textContent = 'Generate Chart';
            chartView.style.display = 'block';
        }
        await populateView(viewName);
    }
}

async function populateView(viewName) {
    currentEditState = await sendMessage({ action: 'getTableEditState', tabId: currentTabId });
    if (!currentEditState || !currentEditState.columns) return;
    currentEditState.visibleColumns = new Set(currentEditState.visibleColumns);
    currentEditState.excludedRows = new Set(currentEditState.excludedRows);
    currentEditState.filters = currentEditState.filters || {};
    if (viewName === 'edit') {
        populateEditView();
    } else if (viewName === 'chart') {
        populateChartView();
    }
}

function populateEditView() {
    columnList.innerHTML = '';

    const liHeader = document.createElement('li');
    liHeader.className = 'column-list-header';
    const masterCheckbox = document.createElement('input');
    masterCheckbox.type = 'checkbox';
    const nameSpanHeader = document.createElement('span');
    nameSpanHeader.className = 'col-name';
    nameSpanHeader.textContent = 'Select All';
    liHeader.appendChild(masterCheckbox);
    liHeader.appendChild(nameSpanHeader);
    columnList.appendChild(liHeader);

    const updateMasterCheckboxState = () => {
        const colCheckboxes = columnList.querySelectorAll('li:not(.column-list-header) input[type="checkbox"]');
        const checkedCount = Array.from(colCheckboxes).filter(cb => cb.checked).length;
        if (checkedCount === 0) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
        } else if (checkedCount === colCheckboxes.length) {
            masterCheckbox.checked = true;
            masterCheckbox.indeterminate = false;
        } else {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = true;
        }
    };

    currentEditState.columnOrder.forEach(originalIndex => {
        const column = currentEditState.columns.find(c => c.originalIndex === originalIndex);
        if (!column) return;

        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.originalIndex = originalIndex;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = currentEditState.visibleColumns.has(originalIndex);
        checkbox.onchange = () => {
            if (checkbox.checked) currentEditState.visibleColumns.add(originalIndex);
            else currentEditState.visibleColumns.delete(originalIndex);
            sendMessage({ action: 'updateTableEditState', newState: { visibleColumns: Array.from(currentEditState.visibleColumns) } });
            updateMasterCheckboxState();
        };

        const nameSpan = document.createElement('span');
        nameSpan.className = 'col-name';
        nameSpan.textContent = column.name;

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'col-controls';
        const filterIcon = document.createElement('i');
        filterIcon.className = 'bx bx-filter filter-icon';
        filterIcon.title = "Filter by value";
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.className = 'filter-input';
        filterInput.placeholder = 'Filter...';
        filterInput.value = currentEditState.filters[originalIndex] || '';
        if (filterInput.value) filterInput.classList.add('active');
        filterIcon.onclick = () => filterInput.classList.toggle('active');
        filterInput.oninput = () => {
            currentEditState.filters[originalIndex] = filterInput.value;
            sendMessage({ action: 'updateTableEditState', newState: { filters: currentEditState.filters } });
        };
        
        const sortButtons = document.createElement('div');
        sortButtons.className = 'sort-buttons';
        const ascBtn = document.createElement('button');
        ascBtn.innerHTML = '&#9650;'; ascBtn.title = "Sort Ascending";
        const descBtn = document.createElement('button');
        descBtn.innerHTML = '&#9660;'; descBtn.title = "Sort Descending";

        ascBtn.onclick = () => {
            let newSortState = { columnIndex: originalIndex, direction: 'asc' };
            if (currentEditState.sortState.columnIndex === originalIndex && currentEditState.sortState.direction === 'asc') newSortState = { columnIndex: null, direction: 'none' };
            sendMessage({ action: 'updateTableEditState', newState: { sortState: newSortState } });
        };
        descBtn.onclick = () => {
            let newSortState = { columnIndex: originalIndex, direction: 'desc' };
            if (currentEditState.sortState.columnIndex === originalIndex && currentEditState.sortState.direction === 'desc') newSortState = { columnIndex: null, direction: 'none' };
            sendMessage({ action: 'updateTableEditState', newState: { sortState: newSortState } });
        };
        if (currentEditState.sortState.columnIndex === originalIndex) {
            if (currentEditState.sortState.direction === 'asc') ascBtn.classList.add('active');
            else if (currentEditState.sortState.direction === 'desc') descBtn.classList.add('active');
        }
        sortButtons.appendChild(ascBtn);
        sortButtons.appendChild(descBtn);

        li.appendChild(checkbox);
        li.appendChild(nameSpan);
        controlsDiv.appendChild(filterIcon);
        controlsDiv.appendChild(sortButtons);
        li.appendChild(controlsDiv);
        li.appendChild(filterInput);
        columnList.appendChild(li);
    });
    
    updateMasterCheckboxState();

    masterCheckbox.onchange = () => {
        const isChecked = masterCheckbox.checked;
        const allColumnIndices = currentEditState.columns.map(c => c.originalIndex);
        columnList.querySelectorAll('li:not(.column-list-header) input[type="checkbox"]').forEach(cb => cb.checked = isChecked);
        if (isChecked) {
            currentEditState.visibleColumns = new Set(allColumnIndices);
        } else {
            currentEditState.visibleColumns.clear();
        }
        sendMessage({ action: 'updateTableEditState', newState: { visibleColumns: Array.from(currentEditState.visibleColumns) } });
    };

    let draggedItem = null;
    columnList.addEventListener('dragstart', (e) => {
        if(e.target.classList.contains('column-list-header')) return;
        draggedItem = e.target;
        setTimeout(() => e.target.classList.add('dragging'), 0);
    });
    columnList.addEventListener('dragend', () => { 
        if (!draggedItem) return;
        draggedItem.classList.remove('dragging');
        const newOrder = [...columnList.querySelectorAll('li:not(.column-list-header)')].map(li => parseInt(li.dataset.originalIndex));
        sendMessage({ action: 'updateTableEditState', newState: { columnOrder: newOrder } });
        draggedItem = null;
    });
    columnList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = [...columnList.querySelectorAll('li:not(.column-list-header)')].find(child => e.clientY < child.getBoundingClientRect().top + child.offsetHeight / 2);
        if (draggedItem) {
            columnList.insertBefore(draggedItem, afterElement || null);
        }
    });
}

// --- CHART VIEW LOGIC (REWORKED) ---
const CHART_COLORS = ['#36a2eb', '#ff6384', '#ff9f40', '#4bc0c0', '#9966ff', '#ffcd56', '#c9cbcf'];
let columnOptionsHTML = '';

/**
 * Generates an array of visually distinct HSLA colors.
 * @param {number} count The number of colors to generate.
 * @returns {string[]} An array of HSLA color strings.
 */
function generateHslaColors(count) {
    const colors = [];
    const saturation = 75; // Use a vibrant saturation
    const lightness = 60; // Keep lightness consistent
    for (let i = 0; i < count; i++) {
        // Distribute hues evenly around the color wheel
        const hue = (i * (360 / (count + 1))) % 360;
        colors.push(`hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`);
    }
    return colors;
}

function addSeriesRow() {
    const seriesCount = dataSeriesContainer.children.length;
    const newSeries = document.createElement('div');
    newSeries.className = 'data-series-item';

    const select = document.createElement('select');
    select.innerHTML = columnOptionsHTML;
    
    if (select.options.length > seriesCount + 1) {
        const usedIndexes = Array.from(dataSeriesContainer.querySelectorAll('select')).map(s => s.selectedIndex);
        let nextIndex = 1;
        while(usedIndexes.includes(nextIndex)) {
            nextIndex++;
        }
        if(nextIndex < select.options.length) {
            select.selectedIndex = nextIndex;
        }
    } else if (select.options.length > 1) {
        select.selectedIndex = 1;
    }

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = CHART_COLORS[seriesCount % CHART_COLORS.length];

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-series-btn';
    removeBtn.innerHTML = "<i class='bx bx-x-circle'></i>";
    removeBtn.title = 'Remove Series';
    removeBtn.onclick = () => {
        newSeries.remove();
        updateChartUI();
    };

    newSeries.appendChild(select);
    newSeries.appendChild(colorInput);
    newSeries.appendChild(removeBtn);
    dataSeriesContainer.appendChild(newSeries);
    updateChartUI();
}

function updateChartUI() {
    const type = chartTypeSelect.value;
    
    [configBarLine, configPie, configScatter].forEach(el => el.style.display = 'none');

    switch(type) {
        case 'bar':
        case 'line':
            configBarLine.style.display = 'block';
            const seriesCount = dataSeriesContainer.children.length;
            const removeButtons = dataSeriesContainer.querySelectorAll('.remove-series-btn');
            removeButtons.forEach(btn => { btn.style.display = seriesCount > 1 ? 'flex' : 'none'; });
            break;
        case 'pie':
            configPie.style.display = 'block';
            break;
        case 'scatter':
            configScatter.style.display = 'block';
            break;
    }
}

function populateChartView() {
    columnOptionsHTML = '';
    const visibleCols = currentEditState.columnOrder
        .map(originalIndex => currentEditState.columns.find(c => c.originalIndex === originalIndex))
        .filter(column => column && currentEditState.visibleColumns.has(column.originalIndex));

    if (visibleCols.length < 2) {
        // Temporarily modify chartView to show a message, will be reset when view is switched
        const originalHTML = chartView.innerHTML;
        chartView.innerHTML = '<p style="text-align: center; padding: 20px;">Please make at least two columns visible in the "Edit Table" view to generate a chart.</p>';
        // Restore original HTML if user navigates away
        backBtn.addEventListener('click', () => { chartView.innerHTML = originalHTML; }, { once: true });
        return;
    }

    visibleCols.forEach(column => {
        columnOptionsHTML += `<option value="${column.originalIndex}">${column.name}</option>`;
    });
    
    [labelColumnBarLine, labelColumnPie, dataColumnPie, dataColumnXScatter, dataColumnYScatter].forEach(select => {
        select.innerHTML = columnOptionsHTML;
    });

    labelColumnBarLine.selectedIndex = 0;
    labelColumnPie.selectedIndex = 0;
    dataColumnPie.selectedIndex = 1;
    dataColumnXScatter.selectedIndex = 0;
    dataColumnYScatter.selectedIndex = 1;

    dataSeriesContainer.innerHTML = '';
    addSeriesRow();
    updateChartUI();
}

addSeriesBtn.onclick = () => addSeriesRow();
chartTypeSelect.onchange = updateChartUI;
generateChartBtn.onclick = async () => {
    const tableData = await sendMessage({ action: 'getChartData', tableIndex: currentTableIndex, tabId: currentTabId });
    if (!tableData || tableData.length < 2) {
        alert("Not enough data to create a chart."); return;
    }

    const chartType = chartTypeSelect.value;
    const visibleOrderedIndices = currentEditState.columnOrder.filter(index => currentEditState.visibleColumns.has(index));
    const header = tableData[0];
    const body = tableData.slice(1);
    
    const chartConfig = {
        type: chartType,
        title: chartTitleInput.value.trim(),
        labels: [],
        datasets: []
    };

    const cleanValue = (val) => parseFloat(String(val).replace(/[^0-9.-]+/g, "")) || 0;

    switch(chartType) {
        case 'bar':
        case 'line': {
            const labelColIndex = visibleOrderedIndices.indexOf(parseInt(labelColumnBarLine.value, 10));
            if (labelColIndex === -1) { alert("Label column not found."); return; }
            chartConfig.labels = body.map(row => row[labelColIndex]);

            const seriesItems = dataSeriesContainer.querySelectorAll('.data-series-item');
            seriesItems.forEach(item => {
                const select = item.querySelector('select');
                const color = item.querySelector('input[type="color"]').value;
                const dataColIndex = visibleOrderedIndices.indexOf(parseInt(select.value, 10));
                if (dataColIndex === -1) return;

                chartConfig.datasets.push({
                    label: header[dataColIndex],
                    data: body.map(row => cleanValue(row[dataColIndex])),
                    backgroundColor: color,
                    borderColor: color,
                    borderWidth: chartType === 'line' ? 2 : 1,
                });
            });
            break;
        }
        case 'pie': {
            const labelColIndex = visibleOrderedIndices.indexOf(parseInt(labelColumnPie.value, 10));
            const dataColIndex = visibleOrderedIndices.indexOf(parseInt(dataColumnPie.value, 10));
            if (labelColIndex === -1 || dataColIndex === -1) { alert("Column not found."); return; }
            
            chartConfig.labels = body.map(row => row[labelColIndex]);
            const sliceCount = body.length;

            chartConfig.datasets.push({
                label: header[dataColIndex],
                data: body.map(row => cleanValue(row[dataColIndex])),
                backgroundColor: generateHslaColors(sliceCount),
            });
            break;
        }
        case 'scatter': {
            const xColIndex = visibleOrderedIndices.indexOf(parseInt(dataColumnXScatter.value, 10));
            const yColIndex = visibleOrderedIndices.indexOf(parseInt(dataColumnYScatter.value, 10));
            if (xColIndex === -1 || yColIndex === -1) { alert("Column not found."); return; }
            chartConfig.datasets.push({
                label: `${header[yColIndex]} vs ${header[xColIndex]}`,
                data: body.map(row => ({
                    x: cleanValue(row[xColIndex]),
                    y: cleanValue(row[yColIndex])
                })),
                backgroundColor: CHART_COLORS[0],
            });
            break;
        }
    }

    if (chartConfig.datasets.length === 0 || chartConfig.datasets[0].data.length === 0) {
        alert("No valid data could be processed for the selected columns."); return;
    }

    sendMessage({ action: 'renderChartOnPage', tabId: currentTabId, chartConfig });
    // REMOVED: switchView('main'); // User wants to stay in the chart view
};


// --- Listeners & Utility Functions ---
chrome.runtime.onMessage.addListener(async (request) => {
    if(!request || !request.action) return;
    if (request.action === 'updateSelectionFromPage') {
        if (currentTableIndex !== request.newIndex) {
            currentTableIndex = request.newIndex;
            await updateTableSelection();
        }
    } else if (request.action === 'changeView') {
        switchView(request.view);
    } else if (request.action === 'showErrorInUI') {
        // When an error message is received, stop the loading spinner
        exportButton.classList.remove('loading');
        showFeedback(request.message, 'error', 5000);
    } else if (request.action === 'fileGenerated') {
        exportButton.classList.remove('loading');
        showFeedback('Download started!', 'success');
    } else if (request.action === 'tablesUpdated') {
        tablesOnPage = request.data.tables;
        if (currentTableIndex >= tablesOnPage.length) {
            currentTableIndex = tablesOnPage.length > 0 ? 0 : -1;
        }
        await updateTableSelection();
    }
});

function toggleAdvancedOptions() {
    const currentFormat = formatSelect.value;
    document.querySelectorAll('.advanced-format-option').forEach(el => {
        el.style.display = el.dataset.format === currentFormat ? 'block' : 'none';
    });
}
function updateUIForNoTables() {
    tableIndicator.textContent = 'No tables found';
    filenameInput.placeholder = 'No tables found';
    filenameInput.disabled = true;
    prevTableBtn.disabled = true;
    nextTableBtn.disabled = true;
    exportButton.disabled = true;
    copyButton.disabled = true;
    copyStyledButton.disabled = true;
}
function showFeedback(message, type = 'in-progress', duration = 3000) {
    clearTimeout(statusTimeout);
    statusFeedback.textContent = message;
    statusFeedback.className = type;
    if (type !== 'in-progress') {
        statusTimeout = setTimeout(() => { statusFeedback.textContent = ''; statusFeedback.className = ''; }, duration);
    }
}
const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        sendMessage({ action: 'updateIframeHeight', height: entry.contentRect.height });
    }
});
resizeObserver.observe(document.getElementById('supbyte-exporter-dialog'));