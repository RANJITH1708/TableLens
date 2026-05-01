// --- STATE MANAGEMENT HELPERS (New) ---
// These functions use chrome.storage.session to persist data across service worker restarts.
// This is the key to fixing the issue where table selection stops working after inactivity.
async function getTabData(tabId) {
    if (!tabId) return undefined;
    const key = `tab_${tabId}`;
    const data = await chrome.storage.session.get(key);
    return data[key];
}

async function setTabData(tabId, data) {
    if (!tabId) return;
    const key = `tab_${tabId}`;
    await chrome.storage.session.set({ [key]: data });
}

async function clearTabData(tabId) {
    if (!tabId) return;
    const key = `tab_${tabId}`;
    await chrome.storage.session.remove(key);
}

// --- GLOBAL STATE ---
const activeUITabs = new Set();
let creating; // For offscreen document
let reloadAndReopenState = {};


// --- INITIALIZATION & EVENT LISTENERS ---
chrome.runtime.onInstalled.addListener(() => {
    setupOffscreenDocument('offscreen.html');
    chrome.contextMenus.create({
        id: 'supbyte-open',
        title: 'TableLens: Edit, Chart & Export', // MODIFIED
        contexts: ['all']
    });
});

chrome.action.onClicked.addListener((tab) => toggleUI(tab));
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'supbyte-open') toggleUI(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && reloadAndReopenState[tabId]) {
        const { view, fingerprint } = reloadAndReopenState[tabId];
        console.log(`TableLens Debug: Tab ${tabId} finished reloading. Searching for table with fingerprint:`, fingerprint); // MODIFIED
        
        // ▼ FILENAME CORRECTED HERE ▼
        await executeScript({ target: { tabId }, files: ['lib/chart.umd.min.js'] }).catch(e => console.warn(e));
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'findTableByFingerprint', fingerprint });
            if (response && response.success) {
                console.log(`TableLens Debug: Table found at new index ${response.newIndex}. Re-opening UI.`); // MODIFIED
                chrome.tabs.sendMessage(tabId, {
                    action: 'showUI',
                    data: { selectedIndex: response.newIndex, view: view }
                });
            } else {
                console.log('TableLens Debug: Could not re-find table after reload.'); // MODIFIED
            }
        } catch(e) {
            console.warn('TableLens Debug: Could not communicate with content script after reload.', e.message); // MODIFIED
        } finally {
            delete reloadAndReopenState[tabId];
        }
    }
});

async function toggleUI(tab) {
    if (activeUITabs.has(tab.id)) {
        await closeInjectedUI(tab.id);
        return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log(`TableLens: Cannot connect to content script on tab ${tab.id}. This is expected on protected pages.`); // MODIFIED
            return;
        }
        if (response && response.success) {
            // ▼ FILENAME CORRECTED HERE ▼
            executeScript({ 
                target: { tabId: tab.id, allFrames: true }, 
                files: ['lib/chart.umd.min.js'] 
            }).then(() => {
                chrome.tabs.sendMessage(tab.id, { action: 'showUI' });
            });
        }
    });
}

// --- MESSAGE LISTENERS ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab?.id || request.tabId;
    if (!tabId && !['downloadFile', 'offscreenTaskComplete', 'getStorage', 'setStorage', 'downloadError'].includes(request.action)) return true;

    const actions = {
        getStorage: (keys) => chrome.storage.sync.get(keys),
        setStorage: (data) => chrome.storage.sync.set(data),

        tablesReady: async (data) => {
            await setTabData(tabId, { ...data, tabId, frameId: sender.frameId });
            executeScript({ target: { tabId }, func: injectIframe });
            activeUITabs.add(tabId);
        },
        offscreenTaskComplete: () => {
             chrome.runtime.sendMessage({ action: 'fileGenerated' }).catch(() => {});
             return Promise.resolve({success: true});
        },
        downloadError: (data) => {
            chrome.runtime.sendMessage({ 
                action: 'showErrorInUI', 
                message: data.error 
            }).catch(() => {});
            return Promise.resolve({success: true});
        },
        tablesUpdated: async (data) => {
            const existingData = await getTabData(tabId);
            if (existingData) {
                await setTabData(tabId, { ...existingData, ...data });
            }
            chrome.runtime.sendMessage({ action: 'tablesUpdated', data: data }).catch(() => {});
            return Promise.resolve({success: true});
        },
        reloadAndReopen: async (data) => {
            console.log('TableLens Debug: Received reloadAndReopen message.', data); // MODIFIED
            const { view } = data;
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            console.log('TableLens Debug: Requesting fingerprint from content script...'); // MODIFIED
            const fingerprint = await chrome.tabs.sendMessage(tabId, { action: 'getTableFingerprint' }, { frameId });
            
            console.log('TableLens Debug: Received fingerprint:', fingerprint); // MODIFIED
            if (fingerprint) {
                reloadAndReopenState[tabId] = { fingerprint, view };
                console.log('TableLens Debug: Fingerprint saved. Reloading tab now.', reloadAndReopenState); // MODIFIED
                await closeInjectedUI(tabId);
                chrome.tabs.reload(tabId);
            } else {
                 console.error('TableLens Debug: FAILED to get fingerprint. Aborting reload.'); // MODIFIED
            }
        },
        closeInjectedUI: async () => closeInjectedUI(tabId),
        getFoundTables: async () => getTabData(tabId),
        highlightTableInPage: async (data) => {
            const tabData = await getTabData(tabId);
            return highlightTableInPage(tabData?.frameId, tabId, request.tableIndex);
        },
        exportTable: async (data) => processRequest('exportTable', tabId, request),
        copyTable: async (data) => processRequest('copyTable', tabId, request),
        copyTableStyled: async (data) => {
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            const tableHTML = await chrome.tabs.sendMessage(tabId, { action: 'getTableHTML', tableIndex: request.tableIndex }, { frameId });
            if (tableHTML) {
                await executeScript({
                    target: { tabId },
                    func: (html) => {
                        const blob = new Blob([html], { type: 'text/html' });
                        const data = [new ClipboardItem({ 'text/html': blob })];
                        navigator.clipboard.write(data);
                    },
                    args: [tableHTML]
                });
            }
            return { success: !!tableHTML };
        },
        getChartData: async () => {
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            return await chrome.tabs.sendMessage(tabId, { action: 'getChartData', tableIndex: request.tableIndex }, { frameId });
        },
        tableClickedOnPage: async (data) => handleTableClick(tabId, data.newIndex, sender.frameId),
        initiateDrag: async (data) => executeScript({ target: { tabId }, func: dragHandler, args: [request.offsetX, request.offsetY] }),
        updateIframeHeight: async (data) => executeScript({ target: { tabId }, func: (h) => { const i = document.getElementById('supbyte-ui-iframe'); if (i) i.style.height = `${h}px`; }, args: [request.height] }),
        downloadFile: async (data) => chrome.downloads.download({ url: request.url, filename: request.filename }),
        openViewInUI: async () => chrome.runtime.sendMessage({ action: 'changeView', view: request.view }),
        getTableEditState: async () => {
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            return await chrome.tabs.sendMessage(tabId, { action: 'getTableEditState' }, { frameId });
        },
        updateTableEditState: async (data) => {
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            return await chrome.tabs.sendMessage(tabId, { action: 'updateTableEditState', data: request.newState }, { frameId });
        },
        renderChartOnPage: async (data) => {
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            chrome.tabs.sendMessage(tabId, { action: 'renderChartOnPage', data: request.chartConfig }, { frameId });
        },
        enterPageEditMode: async () => {
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            chrome.tabs.sendMessage(tabId, { action: 'togglePageEditMode', data: { isEditing: true } }, { frameId });
        },
        exitPageEditMode: async () => {
            const tabData = await getTabData(tabId);
            const frameId = tabData?.frameId;
            chrome.tabs.sendMessage(tabId, { action: 'togglePageEditMode', data: { isEditing: false } }, { frameId });
        }
    };

    const action = actions[request.action];
    if (action) {
        (async () => {
            try {
                const result = await action(request.data || request);
                sendResponse(result);
            } catch (err) {
                 console.error(`TableLens Error in action '${request.action}':`, err); // MODIFIED
                if (tabId) {
                    chrome.runtime.sendMessage({ 
                        action: 'showErrorInUI', 
                        message: 'An unexpected error occurred.' 
                    }).catch(() => {});
                }
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }
});


// --- CORE LOGIC & UTILITIES ---
async function closeInjectedUI(tabId) {
    if(!tabId) return;
    await executeScript({ 
        target: { tabId, allFrames: true }, 
        func: () => {
            document.getElementById('supbyte-ui-iframe')?.remove();
            window.dispatchEvent(new CustomEvent('cleanupSupbyte'));
        } 
    });
    activeUITabs.delete(tabId);
    await clearTabData(tabId);
}

async function processRequest(action, tabId, details) {
    const tabData = await getTabData(tabId);
    const frameId = tabData?.frameId;
    const data = await getTableDataFromPage(frameId, tabId, details.tableIndex);
    if (!data) return { success: false };
    if (action === 'exportTable') {
        await setupOffscreenDocument('offscreen.html');
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'generateFile', data, format: details.format, filename: details.filename, options: details.options });
    } else if (action === 'copyTable') {
        const plainData = data.map(row => row.map(cell => cell.text));
        const csvText = await chrome.tabs.sendMessage(tabId, { action: 'copyTableToClipboard', data: plainData }, { frameId });
        if (csvText) {
             await executeScript({ target: { tabId }, func: (text) => navigator.clipboard.writeText(text), args: [csvText]});
        }
    }
    return { success: true };
}

async function getTableDataFromPage(frameId, tabId, tableIndex) {
    return await chrome.tabs.sendMessage(tabId, { action: 'getTableData', tableIndex: tableIndex }, { frameId });
}

async function highlightTableInPage(frameId, tabId, tableIndex) {
    const settings = await chrome.storage.sync.get({ filenamePattern: '[pageTitle]' });
    return await chrome.tabs.sendMessage(tabId, { action: 'highlightTable', tableIndex: tableIndex, filenamePattern: settings.filenamePattern }, { frameId });
}

async function handleTableClick(tabId, newIndex, frameId) {
    let tabData = await getTabData(tabId);
    // This check is now reliable because the data persists.
    if (tabData) {
        tabData.selectedIndex = newIndex;
        tabData.frameId = frameId;
        await setTabData(tabId, tabData); // Save the updated state to session storage
        await highlightTableInPage(frameId, tabId, newIndex);
        chrome.runtime.sendMessage({ action: 'updateSelectionFromPage', newIndex });
    }
}

async function executeScript(options) {
    try { await chrome.scripting.executeScript(options); }
    catch (e) { console.warn(`TableLens: Could not execute script. ${e.message}`); } // MODIFIED
}

function injectIframe() {
    if (document.getElementById('supbyte-ui-iframe')) return;
    const iframe = document.createElement('iframe');
    iframe.id = 'supbyte-ui-iframe';
    iframe.src = chrome.runtime.getURL('injected-ui.html');
    Object.assign(iframe.style, { position: 'fixed', top: '20px', right: '20px', width: '335px', height: 'auto', zIndex: 2147483647, border: 'none', backgroundColor: 'transparent' });
    document.body.appendChild(iframe);
}

function dragHandler(offsetX, offsetY) {
    const iframe = document.getElementById('supbyte-ui-iframe');
    if (!iframe) return;

    const originalBodyCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    iframe.style.pointerEvents = 'none';

    function onMouseMove(e) {
        e.preventDefault();
        iframe.style.left = `${e.clientX - offsetX}px`;
        iframe.style.top = `${e.clientY - offsetY}px`;
        iframe.style.right = 'auto';
    }

    function onMouseUp() {
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);
        
        document.body.style.cursor = originalBodyCursor;
        if (iframe) {
            iframe.style.pointerEvents = 'auto';
        }
    }

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
}

async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] });
    if (existingContexts.length > 0) return;
    if (creating) { await creating; }
    else {
        creating = chrome.offscreen.createDocument({ url: path, reasons: ['BLOBS'], justification: 'To generate and download export files.' });
        await creating;
        creating = null;
    }
}