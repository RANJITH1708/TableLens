function saveOptions() {
    const defaultFormat = document.getElementById('defaultFormat').value;
    const filenamePattern = document.getElementById('filenamePattern').value;

    chrome.storage.sync.set({
        defaultFormat: defaultFormat,
        filenamePattern: filenamePattern
    }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Options saved successfully!';
        setTimeout(() => { status.textContent = ''; }, 1500);
    });
}

function restoreOptions() {
    const defaults = {
        defaultFormat: 'xlsx',
        filenamePattern: '[pageTitle]'
    };

    chrome.storage.sync.get(defaults, (settings) => {
        document.getElementById('defaultFormat').value = settings.defaultFormat;
        document.getElementById('filenamePattern').value = settings.filenamePattern;
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);