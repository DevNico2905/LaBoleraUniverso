const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Cargar el index.html del build de Angular
  win.loadFile(path.join(__dirname, 'dist/bolera/browser/index.html'));
  
  // Bloquear recarga y cierre nativo de Electron (F5, Ctrl+R, Cmd+R, Ctrl+W, Cmd+W)
  win.webContents.on('before-input-event', (event, input) => {
    const isReloadOrClose = (input.control || input.meta) && (input.key.toLowerCase() === 'r' || input.key.toLowerCase() === 'w');
    if (input.key === 'F5' || isReloadOrClose) {
      event.preventDefault();
      console.log('Acción bloqueada en Electron (F5/Reload/Close)');
    }
  });

  // Abrir DevTools (opcional, para debug)
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});