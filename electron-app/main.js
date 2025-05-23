const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const KahootHandler = require('./kahoot-handler');

let mainWindow;
let kahootHandler;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Open DevTools (uncomment if needed)
  // mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();
  kahootHandler = new KahootHandler();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Gérer la connexion à Kahoot
ipcMain.handle('join-kahoot', async (event, { pin, pseudo, apiKey }) => {
  try {
    await kahootHandler.initialize();
    const success = await kahootHandler.joinGame(pin, pseudo);
    if (success && apiKey) {
      kahootHandler.monitorQuestions(apiKey);
    }
    return { success };
  } catch (error) {
    console.error('Erreur lors de la connexion à Kahoot:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-game-phase', () => {
  return kahootHandler && kahootHandler.currentPhase ? kahootHandler.currentPhase : 'inconnue';
});

ipcMain.handle('get-current-answers', async () => {
  if (kahootHandler && kahootHandler.getCurrentAnswers) {
    return await kahootHandler.getCurrentAnswers();
  }
  return [];
});

ipcMain.handle('get-current-question', async () => {
  if (kahootHandler && kahootHandler.getCurrentQuestion) {
    return await kahootHandler.getCurrentQuestion();
  }
  return '';
});

ipcMain.handle('get-current-score', async () => {
  if (kahootHandler && kahootHandler.getCurrentScore) {
    return await kahootHandler.getCurrentScore();
  }
  return '';
});

ipcMain.handle('get-current-timer', async () => {
  if (kahootHandler && kahootHandler.getCurrentTimer) {
    return await kahootHandler.getCurrentTimer();
  }
  return '';
});

ipcMain.handle('get-last-ai-response', () => {
  return kahootHandler && kahootHandler.getLastAIResponse ? kahootHandler.getLastAIResponse() : '';
});
