// This script runs after all libraries in offscreen.html have been loaded.

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request) => {
    if (request.target === 'offscreen' && request.action === "generateFile") {
        const { data, format, filename, options } = request;
        const fullFilename = `${filename}.${format}`;

        try {
            switch (format) {
                case 'pdf':
                    generatePdf(data, fullFilename, filename, options);
                    break;
                case 'docx':
                    generateDocx(data, fullFilename);
                    break;
                case 'csv':
                    generateCsv(data, fullFilename, options);
                    break;
                case 'xlsx':
                    generateXlsx(data, fullFilename, options);
                    break;
                case 'json':
                    generateJson(data, fullFilename, options);
                    break;
                case 'md':
                    generateMd(data, fullFilename);
                    break;
            }
        } catch (error) {
            // **MODIFICATION**: Send a specific error message back to the service worker
            const errorMessage = `Failed to generate ${format.toUpperCase()}: ${error.message}`;
            console.error(`Supbyte Error: ${errorMessage}`);
            chrome.runtime.sendMessage({ action: 'downloadError', error: errorMessage });
        }
    }
});

// --- Helper to convert CSS colors to formats libraries understand ---
function rgbToHex(rgb) {
    if (!rgb || !rgb.startsWith('rgb')) return 'FFFFFF'; // Default to white
    const result = rgb.match(/\d+/g).map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    });
    return result.join('').toUpperCase();
}


// --- File Generation Functions ---

function generatePdf(data, filename, title, options) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: options.pdfOrientation || 'portrait' });
    
    const head = [data[0].map(cell => cell.text)];
    const body = data.slice(1).map(row => row.map(cell => cell.text));

    doc.text(title, 14, 15);
    doc.autoTable({
        head: head,
        body: body,
        startY: 20,
        // **MODIFICATION**: Use new theme and font size options
        theme: options.pdfTheme || 'grid',
        styles: {
            fontSize: parseInt(options.pdfFontSize) || 10
        }
    });
    const blob = doc.output('blob');
    triggerDownload(URL.createObjectURL(blob), filename);
}

function generateDocx(data, filename) {
    const plainData = data.map(row => row.map(cell => cell.text || ''));
    const tableRows = plainData.map(rowData => new window.docx.TableRow({
        children: rowData.map(cellText => new window.docx.TableCell({
            children: [new window.docx.Paragraph({ text: cellText })],
        })),
    }));
    const table = new window.docx.Table({ rows: tableRows });
    const doc = new window.docx.Document({ sections: [{ children: [table] }] });
    window.docx.Packer.toBlob(doc).then(blob => {
        triggerDownload(URL.createObjectURL(blob), filename);
    });
}

function generateCsv(data, filename, options) {
    const plainData = data.map(row => row.map(cell => cell.text || ''));
    const csvContent = window.Papa.unparse(plainData, { delimiter: options.delimiter || ',' });
    const blob = new Blob([csvContent], { type: `text/csv;charset=${options.encoding || 'utf-8'};` });
    triggerDownload(URL.createObjectURL(blob), filename);
}

function generateXlsx(data, filename, options) {
    const plainData = data.map(row => row.map(cell => cell.text));
    const worksheet = XLSX.utils.aoa_to_sheet(plainData);
    data.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (cell.style) {
                const cellRef = XLSX.utils.encode_cell({ r, c });
                if (!worksheet[cellRef]) return;
                const style = { font: {}, fill: {}, alignment: {} };
                if (cell.style.color) { style.font.color = { rgb: rgbToHex(cell.style.color) }; }
                if (cell.style.fontWeight > '400') { style.font.bold = true; }
                if (cell.style.backgroundColor && cell.style.backgroundColor !== 'rgba(0, 0, 0, 0)') { style.fill = { fgColor: { rgb: rgbToHex(cell.style.backgroundColor) } }; }
                if (cell.style.textAlign) { style.alignment = { horizontal: cell.style.textAlign }; }
                worksheet[cellRef].s = style;
            }
        });
    });
    const workbook = window.XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1');
    const wbout = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    triggerDownload(URL.createObjectURL(blob), filename);
}

function generateJson(data, filename, options) {
    // **MODIFICATION**: Handle different JSON format options
    let jsonData;
    const plainData = data.map(row => row.map(cell => cell.text || ''));

    if (options.jsonFormat === 'arrays') {
        // Format as Array of Arrays
        jsonData = plainData;
    } else {
        // Default to Array of Objects
        const headers = plainData[0] || [];
        jsonData = plainData.length > 1 ? plainData.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => { obj[header] = row[index] || ''; });
            return obj;
        }) : [];
    }
    
    const jsonContent = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    triggerDownload(URL.createObjectURL(blob), filename);
}

function generateMd(data, filename) {
    const plainData = data.map(row => row.map(cell => (cell.text || '').replace(/\|/g, '\\|')));
    if (plainData.length === 0) return;

    let mdContent = '';
    
    // Header
    mdContent += `| ${plainData[0].join(' | ')} |\n`;
    
    // Separator
    mdContent += `| ${plainData[0].map(() => '---').join(' | ')} |\n`;

    // Body
    plainData.slice(1).forEach(row => {
        mdContent += `| ${row.join(' | ')} |\n`;
    });

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    triggerDownload(URL.createObjectURL(blob), filename);
}


function triggerDownload(url, filename) {
    chrome.runtime.sendMessage({
        action: 'downloadFile',
        url: url,
        filename: filename
    });

    chrome.runtime.sendMessage({ action: 'offscreenTaskComplete' });

    setTimeout(() => URL.revokeObjectURL(url), 100);
}